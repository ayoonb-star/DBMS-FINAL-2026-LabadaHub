import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen, Card, Colors, PageHeader, Pill, Row, SectionTitle, money } from '@/components/laundry-ui';
import { useLaundry } from '@/context/laundry-context';
import type { LaundryBooking } from '@/context/laundry-context';
import { useAuth } from '@/context/auth-context';

const NEXT_STATUSES = [
  { status: 'Washing', label: 'Start wash' },
  { status: 'Drying', label: 'Move to drying' },
  { status: 'Folding', label: 'Start folding' },
  { status: 'Ready', label: 'Mark ready' },
];

export default function StaffScreen() {
  const { booking } = useLaundry();
  const { user } = useAuth();

  if (user?.role === 'client') {
    return <Redirect href="/" />;
  }
  if (!booking) {
    return (
      <AppScreen>
        <PageHeader eyebrow="Branch tools" title="Staff intake" detail="Scan, weigh and update laundry orders." />
        <Card>
          <Text style={styles.emptyTitle}>No booking to process</Text>
          <Text style={styles.emptyText}>Create a customer booking first. It will appear here for intake and status updates.</Text>
        </Card>
      </AppScreen>
    );
  }

  return <StaffIntake key={booking.reference} booking={booking} />;
}

function StaffIntake({ booking }: { booking: LaundryBooking }) {
  const { updateBooking } = useLaundry();
  const [quantity, setQuantity] = useState(booking.verifiedQuantity ?? booking.quantity);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'GCash / Maya'>('Cash');
  const [received, setReceived] = useState('');
  const [saved, setSaved] = useState(false);

  const total = quantity * booking.service.rate * (1 - booking.discountRate) + booking.addonTotal;
  const change = Math.max(0, Number(received || 0) - total);
  const increment = booking.service.unit === 'kg' ? 0.1 : 1;
  const minimum = booking.service.unit === 'kg' ? 0.1 : 1;

  const saveIntake = () => {
    updateBooking({
      verifiedQuantity: quantity,
      ...(booking.status === 'Booked' ? { status: 'Received' } : {}),
    });
    setSaved(true);
  };

  return (
    <AppScreen>
      <PageHeader eyebrow="Branch tools" title="Staff intake" detail="Impalambong Main Branch · Shift active" />

      <Card style={styles.staffBanner}>
        <Row style={styles.staffRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>MS</Text></View>
          <View style={styles.staffCopy}>
            <Text style={styles.staffName}>Maria Santos</Text>
            <Text style={styles.staffBranch}>Laundry attendant</Text>
          </View>
          <Pill tone="green">ON SHIFT</Pill>
        </Row>
      </Card>

      <Card>
        <SectionTitle title="Order lookup" detail="Use the customer's booking reference" />
        <View style={styles.lookupField}>
          <Text style={styles.lookupPrefix}>#</Text>
          <Text style={styles.lookupValue}>{booking.reference}</Text>
          <Pill tone="blue">FOUND</Pill>
        </View>
        <View style={styles.customer}>
          <Text style={styles.customerName}>Laundry booking</Text>
          <Text style={styles.customerDetail}>{booking.service.name} · Scheduled {booking.date}, {booking.slot}</Text>
          {booking.notes ? <Text style={styles.customerDetail}>Notes: {booking.notes}</Text> : null}
        </View>
      </Card>

      <Card>
        <SectionTitle
          title={booking.service.unit === 'kg' ? 'Certified scale weight' : 'Verified item count'}
          detail={booking.service.unit === 'kg' ? 'Record the verified load before processing.' : 'Count and inspect each item before processing.'}
        />
        <View style={styles.weightControl}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${booking.service.unit === 'kg' ? 'weight' : 'item count'}`}
            onPress={() => { setQuantity((current) => Math.max(minimum, Number((current - increment).toFixed(1)))); setSaved(false); }}
            style={styles.adjustButton}>
            <Text style={styles.adjustText}>−{increment}</Text>
          </Pressable>
          <View style={styles.weightValue}>
            <Text style={styles.weightNumber}>{booking.service.unit === 'kg' ? quantity.toFixed(1) : quantity.toFixed(0)}</Text>
            <Text style={styles.weightUnit}>{booking.service.unit.toUpperCase()}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${booking.service.unit === 'kg' ? 'weight' : 'item count'}`}
            onPress={() => { setQuantity((current) => Number((current + increment).toFixed(1))); setSaved(false); }}
            style={[styles.adjustButton, styles.adjustButtonPrimary]}>
            <Text style={[styles.adjustText, styles.adjustTextPrimary]}>+{increment}</Text>
          </Pressable>
        </View>
        <View style={styles.priceLine}>
          <Text style={styles.customerDetail}>Certified total</Text>
          <Text style={styles.price}>{money(total)}</Text>
        </View>
      </Card>

      <Card>
        <SectionTitle title="Processing status" detail={`Current status: ${booking.status}`} />
        <View style={styles.actionGrid}>
          {NEXT_STATUSES.map((item) => {
            const active = booking.status === item.status;
            return (
              <Pressable
                key={item.status}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => { updateBooking({ status: item.status }); setSaved(false); }}
                style={[styles.statusButton, active && styles.statusButtonActive]}>
                <Text style={[styles.statusButtonText, active && styles.statusButtonTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Payment settlement" detail="Optional at intake; customer pays at the branch." />
        <View style={styles.actionGrid}>
          {(['Cash', 'GCash / Maya'] as const).map((method) => (
            <Pressable
              key={method}
              accessibilityRole="button"
              accessibilityState={{ selected: paymentMethod === method }}
              onPress={() => setPaymentMethod(method)}
              style={[styles.statusButton, paymentMethod === method && styles.statusButtonActive]}>
              <Text style={[styles.statusButtonText, paymentMethod === method && styles.statusButtonTextActive]}>{method}</Text>
            </Pressable>
          ))}
        </View>
        <Row style={styles.paymentRow}>
          <View style={styles.receivedField}>
            <Text style={styles.fieldLabel}>Received ({paymentMethod})</Text>
            <TextInput
              accessibilityLabel="Amount received"
              value={received}
              onChangeText={(value) => setReceived(value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              style={styles.moneyInput}
            />
          </View>
          <View style={styles.changeField}>
            <Text style={styles.fieldLabel}>Change</Text>
            <Text style={styles.changeValue}>{money(change)}</Text>
          </View>
        </Row>
        <ActionButton onPress={saveIntake}>{saved ? 'Intake saved' : 'Save intake and weight'}</ActionButton>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  staffBanner: { backgroundColor: '#f0f8fc' },
  staffRow: { gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  staffCopy: { flex: 1, gap: 2 },
  staffName: { color: Colors.ink, fontSize: 13, fontWeight: '800' },
  staffBranch: { color: Colors.muted, fontSize: 11 },
  lookupField: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#f4f7fa', borderRadius: 12, padding: 12 },
  lookupPrefix: { color: Colors.muted, fontSize: 13, fontWeight: '700' },
  lookupValue: { flex: 1, color: Colors.primaryDark, fontSize: 14, fontWeight: '800' },
  customer: { gap: 4, paddingTop: 4 },
  customerName: { color: Colors.ink, fontSize: 14, fontWeight: '700' },
  customerDetail: { color: Colors.muted, fontSize: 11, lineHeight: 16 },
  weightControl: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adjustButton: { backgroundColor: '#eef3f7', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12 },
  adjustButtonPrimary: { backgroundColor: Colors.primary },
  adjustText: { color: Colors.ink, fontSize: 12, fontWeight: '700' },
  adjustTextPrimary: { color: Colors.white },
  weightValue: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  weightNumber: { color: Colors.ink, fontSize: 37, fontWeight: '800' },
  weightUnit: { color: Colors.muted, fontSize: 12, fontWeight: '800' },
  priceLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 11 },
  price: { color: Colors.primary, fontSize: 19, fontWeight: '800' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderColor: Colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 42, paddingHorizontal: 8 },
  statusButtonActive: { borderColor: Colors.primary, backgroundColor: Colors.paleBlue },
  statusButtonText: { color: Colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  statusButtonTextActive: { color: Colors.primaryDark, fontWeight: '800' },
  paymentRow: { alignItems: 'stretch' },
  receivedField: { flex: 1, gap: 6 },
  changeField: { flex: 1, justifyContent: 'center', gap: 6, alignItems: 'flex-end' },
  fieldLabel: { color: Colors.muted, fontSize: 10, fontWeight: '700' },
  moneyInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: Colors.ink, fontSize: 13 },
  changeValue: { color: Colors.green, fontSize: 15, fontWeight: '800' },
  emptyTitle: { color: Colors.ink, fontSize: 17, fontWeight: '800' },
  emptyText: { color: Colors.muted, fontSize: 12, lineHeight: 18 },
});
