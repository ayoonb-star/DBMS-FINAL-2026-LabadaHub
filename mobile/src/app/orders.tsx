import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScreen, Card, Colors, PageHeader, Pill, Row, SectionTitle, money } from '@/components/laundry-ui';
import { useLaundry } from '@/context/laundry-context';

const STAGES = ['Booked', 'Received', 'Washing', 'Drying', 'Folding', 'Ready', 'Picked up'];

export default function OrdersScreen() {
  const { booking, updateBooking } = useLaundry();

  if (!booking) {
    return (
      <AppScreen>
        <PageHeader eyebrow="My laundry" title="My orders" detail="Follow every step from drop-off to pickup." />
        <Card>
          <Text style={styles.emptyIcon}>◌</Text>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyText}>Choose a service and a drop-off time to create your first order.</Text>
          <ActionButton onPress={() => router.navigate('/')}>Book a laundry service</ActionButton>
        </Card>
      </AppScreen>
    );
  }

  const currentStage = Math.max(0, STAGES.indexOf(booking.status));
  const quantity = booking.verifiedQuantity ?? booking.quantity;
  const amount = quantity * booking.service.rate * (1 - booking.discountRate) + booking.addonTotal;
  const isComplete = booking.status === 'Picked up';

  return (
    <AppScreen>
      <PageHeader eyebrow="Order tracking" title="My orders" detail="Your laundry journey, updated by the branch team." />
      <Card style={styles.orderHero}>
        <Row style={styles.orderTitle}>
          <View style={styles.orderTitleText}>
            <Text style={styles.reference}>#{booking.reference}</Text>
            <Text style={styles.address}>Impalambong Main Branch</Text>
          </View>
          <Pill tone={isComplete ? 'green' : booking.status === 'Ready' ? 'green' : 'amber'}>{booking.status.toUpperCase()}</Pill>
        </Row>
        <View style={styles.washStatus}>
          <Text style={styles.washStatusLabel}>{isComplete ? 'Order completed' : `Current status: ${booking.status}`}</Text>
          <Text style={styles.washStatusText}>{booking.service.name} · Drop-off {booking.date}, {booking.slot}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(currentStage / (STAGES.length - 1)) * 100}%` }]} />
        </View>
        <Text style={styles.progressCaption}>Step {currentStage + 1} of {STAGES.length}</Text>
      </Card>

      <Card>
        <SectionTitle title="Laundry journey" detail="Your order moves through these care steps" />
        <View style={styles.timeline}>
          {STAGES.map((stage, index) => {
            const done = index < currentStage;
            const active = index === currentStage;
            return (
              <View key={stage} style={styles.stage}>
                <View style={[styles.stageDot, done && styles.stageDone, active && styles.stageActive]}>
                  <Text style={[styles.stageNumber, (done || active) && styles.stageNumberActive]}>{done ? '✓' : index + 1}</Text>
                </View>
                <View style={styles.stageCopy}>
                  <Text style={[styles.stageTitle, active && styles.activeText]}>{stage}</Text>
                  <Text style={styles.stageDetail}>
                    {stage === 'Booked' ? `Drop-off scheduled for ${booking.date}` :
                      stage === 'Received' ? 'Team verifies your items and records the weight' :
                        stage === 'Washing' ? 'Care cycle started at the branch' :
                          stage === 'Ready' ? 'Your bundle is ready for collection' :
                            stage === 'Picked up' ? 'Order collected and closed' : 'Care team is preparing your items'}
                  </Text>
                </View>
                {active ? <Pill tone="blue">NOW</Pill> : null}
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Digital claim stub" detail="Show this booking reference to staff at drop-off or pickup." />
        <View style={styles.claimBox}>
          <Text style={styles.claimLabel}>BOOKING REFERENCE</Text>
          <Text selectable style={styles.claimCode}>{booking.reference}</Text>
          <Text style={styles.claimHint}>A scannable claim QR can be enabled when the booking API is connected.</Text>
        </View>
        <View style={styles.ticketLine}>
          <Text style={styles.ticketLabel}>Service</Text>
          <Text style={styles.ticketValue}>{booking.service.name}</Text>
        </View>
        <View style={styles.ticketLine}>
          <Text style={styles.ticketLabel}>Load</Text>
          <Text style={styles.ticketValue}>{quantity.toFixed(1)} {booking.service.unit}{booking.verifiedQuantity === null ? ' (estimated)' : ' (verified)'}</Text>
        </View>
        {booking.addons.length > 0 ? (
          <View style={styles.ticketLine}>
            <Text style={styles.ticketLabel}>Add-ons</Text>
            <Text style={styles.ticketValue}>{booking.addons.join(', ')}</Text>
          </View>
        ) : null}
        <View style={styles.ticketLine}>
          <Text style={styles.ticketLabel}>{booking.verifiedQuantity === null ? 'Estimated amount' : 'Verified payable'}</Text>
          <Text style={styles.ticketAmount}>{money(amount)}</Text>
        </View>
        {booking.discountRate > 0 ? (
          <View style={styles.ticketLine}>
            <Text style={styles.ticketLabel}>Wash-Dry-Fold promo</Text>
            <Text style={styles.ticketValue}>10% discount applied</Text>
          </View>
        ) : null}
        {booking.notes ? <Text style={styles.notes}>Wash notes: {booking.notes}</Text> : null}
      </Card>

      {!isComplete ? (
        <ActionButton secondary onPress={() => updateBooking({ status: 'Picked up' })}>Mark as picked up</ActionButton>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  orderHero: { backgroundColor: '#f5fbff' },
  orderTitle: { justifyContent: 'space-between', alignItems: 'flex-start' },
  orderTitleText: { flex: 1, gap: 4 },
  reference: { color: Colors.primaryDark, fontSize: 21, fontWeight: '800' },
  address: { color: Colors.muted, fontSize: 11 },
  washStatus: { backgroundColor: Colors.paleAmber, borderRadius: 13, padding: 12, gap: 4 },
  washStatusLabel: { color: Colors.amber, fontSize: 13, fontWeight: '700' },
  washStatusText: { color: '#77521b', fontSize: 11, lineHeight: 16 },
  progressTrack: { height: 7, borderRadius: 6, backgroundColor: '#dce9f0', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6, backgroundColor: Colors.primary },
  progressCaption: { textAlign: 'right', color: Colors.muted, fontSize: 10 },
  timeline: { gap: 0 },
  stage: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  stageDot: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white },
  stageDone: { backgroundColor: Colors.paleGreen, borderColor: '#b7e5cd' },
  stageActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stageNumber: { color: Colors.muted, fontSize: 10, fontWeight: '700' },
  stageNumberActive: { color: Colors.white },
  stageCopy: { flex: 1, gap: 3 },
  stageTitle: { color: Colors.ink, fontSize: 12, fontWeight: '600' },
  activeText: { color: Colors.primary, fontWeight: '800' },
  stageDetail: { color: Colors.muted, fontSize: 10, lineHeight: 14 },
  claimBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f8fc', borderWidth: 1, borderColor: '#dbeaf3', borderRadius: 15, padding: 18, gap: 6 },
  claimLabel: { color: Colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  claimCode: { color: Colors.primaryDark, fontSize: 25, fontWeight: '800', letterSpacing: 1.2 },
  claimHint: { color: Colors.muted, textAlign: 'center', fontSize: 10, lineHeight: 15 },
  ticketLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  ticketLabel: { color: Colors.muted, fontSize: 11 },
  ticketValue: { flex: 1, color: Colors.ink, fontSize: 11, fontWeight: '600', textAlign: 'right' },
  ticketAmount: { color: Colors.primary, fontSize: 15, fontWeight: '800' },
  notes: { color: Colors.muted, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, fontSize: 11, lineHeight: 16 },
  emptyIcon: { alignSelf: 'center', color: Colors.primary, fontSize: 42, fontWeight: '300' },
  emptyTitle: { color: Colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: Colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
});
