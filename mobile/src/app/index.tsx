import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, Card, ChoiceButton, Colors, PageHeader, Pill, Row, SectionTitle, money } from '@/components/laundry-ui';
import { useLaundry } from '@/context/laundry-context';
import type { LaundryService } from '@/context/laundry-context';
import { useAuth } from '@/context/auth-context';

const SERVICES: (LaundryService & { description: string })[] = [
  { id: 'wash', name: 'Wash, Dry & Fold', rate: 35, unit: 'kg', description: 'Everyday clothes, towels and gym wear' },
  { id: 'bedding', name: 'Bedding & Heavy Care', rate: 65, unit: 'kg', description: 'Comforters, duvets and blankets' },
  { id: 'dry-clean', name: 'Premium Dry Clean', rate: 120, unit: 'item', description: 'Barong, suits, gowns and delicates' },
  { id: 'ironing', name: 'Steam Ironing', rate: 25, unit: 'kg', description: 'Crisp press for uniforms and office wear' },
];

const ADDONS = [
  { name: 'Downy Antibac', price: 20 },
  { name: 'Color-safe bleach', price: 25 },
  { name: 'Hypoallergenic soap', price: 30 },
];

const SLOTS = [
  { time: '8:00 AM - 10:00 AM', left: 6 },
  { time: '10:00 AM - 12:00 PM', left: 2 },
  { time: '1:00 PM - 3:00 PM', left: 0 },
  { time: '3:00 PM - 5:00 PM', left: 5 },
];

export default function BookingScreen() {
  const { createBooking } = useLaundry();
  const { user } = useAuth();
  const [serviceId, setServiceId] = useState('wash');
  const [quantity, setQuantity] = useState(7);
  const [addons, setAddons] = useState<string[]>(['Downy Antibac']);
  const [dateIndex, setDateIndex] = useState(0);
  const [slotIndex, setSlotIndex] = useState(0);
  const [notes, setNotes] = useState('');
  const service = SERVICES.find((item) => item.id === serviceId) ?? SERVICES[0];
  const isWeightBased = service.unit === 'kg';
  const increment = isWeightBased ? 0.5 : 1;
  const minimum = isWeightBased ? 5 : 1;
  const addonTotal = ADDONS.filter((item) => addons.includes(item.name)).reduce((total, item) => total + item.price, 0);
  const serviceTotal = quantity * service.rate;
  const dates = useMemo(() => {
    const today = new Date();
    return [0, 1, 2].map((offset) => {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      return {
        label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : date.toLocaleDateString('en', { weekday: 'short' }),
        value: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        weekday: date.getDay(),
      };
    });
  }, []);
  const discountRate = service.id === 'wash' && [1, 3].includes(dates[dateIndex].weekday) ? 0.1 : 0;
  const discount = useMemo(() => serviceTotal * discountRate, [discountRate, serviceTotal]);
  const total = serviceTotal + addonTotal - discount;
  if (user && user.role !== 'client') {
    return <Redirect href={user.role === 'admin' ? '/admin' : '/staff'} />;
  }

  const changeService = (next: LaundryService) => {
    setServiceId(next.id);
    setQuantity(next.unit === 'kg' ? 7 : 2);
  };

  const changeQuantity = (delta: number) => {
    setQuantity((current) => Math.max(minimum, Number((current + delta).toFixed(1))));
  };

  const confirmBooking = () => {
    createBooking({
      service: { id: service.id, name: service.name, rate: service.rate, unit: service.unit },
      quantity,
      addons,
      addonTotal,
      discountRate,
      date: dates[dateIndex].value,
      slot: SLOTS[slotIndex].time,
      notes: notes.trim(),
    });
    router.navigate('/orders');
  };

  return (
    <AppScreen>
      <PageHeader eyebrow="LabadaHub" title="Book a wash" detail="Impalambong Main Branch · Open today until 7:00 PM" />

      <View style={styles.promo}>
        <Pill tone="green">THIS WEEK</Pill>
        <Text style={styles.promoTitle}>10% off Wash-Dry-Fold</Text>
        <Text style={styles.promoText}>Drop off on Mondays or Wednesdays and enjoy a fresh start for less.</Text>
      </View>

      <Card>
        <SectionTitle title="Choose a service" detail="Clear, per-kilo and per-item pricing" />
        <View style={styles.list}>
          {SERVICES.map((item) => (
            <ChoiceButton key={item.id} selected={service.id === item.id} onPress={() => changeService(item)}>
              <Row style={styles.serviceTop}>
                <Text style={styles.serviceName}>{item.name}</Text>
                <Text style={styles.rate}>{money(item.rate)}<Text style={styles.perUnit}> / {item.unit}</Text></Text>
              </Row>
              <Text style={styles.description}>{item.description}</Text>
            </ChoiceButton>
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Estimated load" detail="Final price is confirmed after weighing at drop-off" />
        <View style={styles.quantityRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease load"
            onPress={() => changeQuantity(-increment)}
            style={styles.stepButton}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <View style={styles.quantityValue}>
            <Text style={styles.quantity}>{quantity.toFixed(1)}</Text>
            <Text style={styles.unitLabel}>{isWeightBased ? 'KILOGRAMS' : 'ITEMS'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase load"
            onPress={() => changeQuantity(increment)}
            style={[styles.stepButton, styles.stepButtonActive]}>
            <Text style={[styles.stepText, styles.stepTextActive]}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.subheading}>Add-ons</Text>
        <View style={styles.wrapRow}>
          {ADDONS.map((addon) => {
            const active = addons.includes(addon.name);
            return (
              <Pressable
                key={addon.name}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setAddons((current) => active ? current.filter((name) => name !== addon.name) : [...current, addon.name])}
                style={[styles.addon, active && styles.addonActive]}>
                <Text style={[styles.addonText, active && styles.addonTextActive]}>
                  {active ? '✓ ' : '+ '}{addon.name} · ₱{addon.price}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Drop-off schedule" detail="Choose a date and an available intake window" />
        <Text style={styles.promoHint}>
          {discountRate > 0 ? '10% Wash-Dry-Fold discount applied for Monday / Wednesday.' : 'Book Wash-Dry-Fold on Monday or Wednesday for 10% off.'}
        </Text>
        <View style={styles.wrapRow}>
          {dates.map((date, index) => (
            <ChoiceButton key={date.value} selected={dateIndex === index} onPress={() => setDateIndex(index)}>
              <Text style={[styles.dateLabel, dateIndex === index && styles.selectedText]}>{date.label}</Text>
              <Text style={styles.dateValue}>{date.value}</Text>
            </ChoiceButton>
          ))}
        </View>
        <View style={styles.list}>
          {SLOTS.map((slot, index) => {
            const full = slot.left === 0;
            return (
              <ChoiceButton
                key={slot.time}
                selected={slotIndex === index}
                disabled={full}
                onPress={() => setSlotIndex(index)}>
                <Row style={styles.slotRow}>
                  <View style={styles.slotText}>
                    <Text style={styles.serviceName}>{slot.time}</Text>
                    <Text style={styles.description}>{full ? 'Fully booked' : `${slot.left} spaces remaining`}</Text>
                  </View>
                  <Pill tone={full ? 'red' : slot.left < 3 ? 'amber' : 'green'}>
                    {full ? 'FULL' : `${slot.left} LEFT`}
                  </Pill>
                </Row>
              </ChoiceButton>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Special wash notes" detail="Optional instructions for our laundry team" />
        <TextInput
          accessibilityLabel="Special wash notes"
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Separate whites or use cold water"
          placeholderTextColor="#8a9aaa"
          style={styles.notes}
          textAlignVertical="top"
        />
      </Card>

      <Card>
        <Row style={styles.summaryHead}>
          <Text style={styles.summaryTitle}>Estimated total</Text>
          <Pill tone="neutral">Pay at branch</Pill>
        </Row>
        <View style={styles.totalLine}>
          <Text style={styles.description}>{service.name} · {quantity.toFixed(1)} {service.unit} × ₱{service.rate}</Text>
          <Text style={styles.summaryAmount}>{money(serviceTotal)}</Text>
        </View>
        {addonTotal > 0 ? (
          <View style={styles.totalLine}>
            <Text style={styles.description}>Selected add-ons</Text>
            <Text style={styles.summaryAmount}>{money(addonTotal)}</Text>
          </View>
        ) : null}
        {discount > 0 ? (
          <View style={styles.totalLine}>
            <Text style={styles.description}>Wash-Dry-Fold promo (10% off)</Text>
            <Text style={styles.discountAmount}>−{money(discount)}</Text>
          </View>
        ) : null}
        <View style={styles.totalLine}>
          <Text style={styles.totalLabel}>Estimated payable</Text>
          <Text style={styles.totalValue}>{money(total)}</Text>
        </View>
        <Text style={styles.disclaimer}>Your final amount may change after the team verifies the load at intake.</Text>
        <ActionButton onPress={confirmBooking}>Confirm booking</ActionButton>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  promo: { backgroundColor: Colors.primaryDark, borderRadius: 18, padding: 18, gap: 8 },
  promoTitle: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  promoText: { color: '#d9effa', fontSize: 12, lineHeight: 18 },
  list: { gap: 8 },
  serviceTop: { justifyContent: 'space-between', alignItems: 'flex-start' },
  serviceName: { flex: 1, color: Colors.ink, fontSize: 13, fontWeight: '700' },
  rate: { color: Colors.primary, fontSize: 13, fontWeight: '800' },
  perUnit: { color: Colors.muted, fontSize: 11, fontWeight: '500' },
  description: { color: Colors.muted, fontSize: 11, lineHeight: 16 },
  quantityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 },
  stepButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef3f7' },
  stepButtonActive: { backgroundColor: Colors.primary },
  stepText: { color: Colors.ink, fontSize: 24, fontWeight: '600', lineHeight: 27 },
  stepTextActive: { color: Colors.white },
  quantityValue: { alignItems: 'center', gap: 1 },
  quantity: { color: Colors.primaryDark, fontSize: 34, fontWeight: '800' },
  unitLabel: { color: Colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  subheading: { color: Colors.ink, fontSize: 12, fontWeight: '700', marginTop: 2 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addon: { borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9 },
  addonActive: { borderColor: Colors.primary, backgroundColor: Colors.paleBlue },
  addonText: { color: Colors.muted, fontSize: 10, fontWeight: '600' },
  addonTextActive: { color: Colors.primaryDark },
  dateLabel: { color: Colors.muted, fontSize: 10, fontWeight: '600' },
  dateValue: { color: Colors.ink, fontSize: 12, fontWeight: '700', marginTop: 4 },
  selectedText: { color: Colors.primary },
  slotRow: { justifyContent: 'space-between' },
  slotText: { flex: 1, gap: 3 },
  notes: { minHeight: 82, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, color: Colors.ink, fontSize: 12 },
  summaryHead: { justifyContent: 'space-between' },
  summaryTitle: { color: Colors.ink, fontSize: 17, fontWeight: '800' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  summaryAmount: { color: Colors.ink, fontSize: 12, fontWeight: '700' },
  totalLabel: { color: Colors.ink, fontSize: 13, fontWeight: '700' },
  totalValue: { color: Colors.primary, fontSize: 20, fontWeight: '800' },
  disclaimer: { color: Colors.muted, fontSize: 10, lineHeight: 15 },
  promoHint: { color: Colors.green, fontSize: 10, lineHeight: 15 },
  discountAmount: { color: Colors.green, fontSize: 12, fontWeight: '700' },
});
