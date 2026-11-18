import { useState } from 'react';
import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton, AppScreen, Card, Colors, Metric, PageHeader, Pill, Row, SectionTitle } from '@/components/laundry-ui';
import { useAuth } from '@/context/auth-context';
import type { AccountRole } from '@/context/auth-context';

const INITIAL_SLOTS = [
  { time: '8:00 AM - 10:00 AM', used: 6, capacity: 6 },
  { time: '10:00 AM - 12:00 PM', used: 4, capacity: 6 },
  { time: '1:00 PM - 3:00 PM', used: 6, capacity: 6 },
  { time: '3:00 PM - 5:00 PM', used: 2, capacity: 6 },
];

const SERVICE_LOAD = [
  { name: 'Wash, Dry & Fold', weight: 238, share: 62, color: Colors.primary },
  { name: 'Bedding & Heavy Care', weight: 92, share: 24, color: '#58a7c7' },
  { name: 'Dry Clean & Uniforms', weight: 54, share: 14, color: Colors.green },
];

const RECENT_ACTIVITY = [
  { staff: 'Maria Santos', description: 'Moved order FS-1108 to Washer Drum 04', time: '2 min ago' },
  { staff: 'Joshua Estrada', description: 'Completed pickup for order FS-1102', time: '14 min ago' },
  { staff: 'Front counter', description: 'Reserved the 3:00 PM intake window', time: '25 min ago' },
];

export default function AdminScreen() {
  const { user, invites, createInvite } = useAuth();
  const [slots, setSlots] = useState(INITIAL_SLOTS);
  const [expanded, setExpanded] = useState(false);
  const [inviteRole, setInviteRole] = useState<Exclude<AccountRole, 'client'>>('staff');
  const [newInvite, setNewInvite] = useState('');

  if (user && user.role !== 'admin') {
    return <Redirect href="/staff" />;
  }
  const expandPeak = () => {
    setSlots((current) => current.map((slot, index) => index === 2 ? { ...slot, capacity: slot.capacity + 2 } : slot));
    setExpanded(true);
  };

  const generateInvite = () => {
    setNewInvite(createInvite(inviteRole));
  };

  return (
    <AppScreen>
      <PageHeader eyebrow="Store management" title="Operations" detail="LabadaHub · Impalambong, Malaybalay City" />

      <Card style={styles.liveCard}>
        <Row style={styles.liveHeader}>
          <View style={styles.liveDot} />
          <Text style={styles.liveLabel}>SHOP LIVE · OPERATIONAL</Text>
          <Pill tone="green">OPEN</Pill>
        </Row>
        <Text style={styles.machineCount}>8 of 12 washers active</Text>
        <View style={styles.machineGrid}>
          {Array.from({ length: 12 }, (_, index) => (
            <View key={index} style={[styles.machine, index < 8 && styles.machineActive]} />
          ))}
        </View>
      </Card>

      <View style={styles.metrics}>
        <Metric label="Today's revenue" value="₱14,850" note="+18.4% vs yesterday" />
        <Metric label="Volume handled" value="384 kg" note="42 orders logged" />
      </View>
      <View style={styles.metrics}>
        <Metric label="In progress" value="16 loads" note="4 washing · 6 drying · 6 folding" />
        <Metric label="Ready to claim" value="8 orders" note="SMS sent · Awaiting pickup" />
      </View>

      <Card>
        <SectionTitle title="Drop-off slot capacity" detail="Default limit: 6 customer drop-offs per window" />
        <View style={styles.slotList}>
          {slots.map((slot) => {
            const full = slot.used >= slot.capacity;
            const busy = slot.used / slot.capacity > 0.5;
            const tone = full ? 'red' : busy ? 'blue' : 'green';
            const color = full ? Colors.red : busy ? Colors.primary : Colors.green;
            return (
              <View key={slot.time} style={styles.slot}>
                <Row style={styles.slotHeader}>
                  <Text style={styles.slotTime}>{slot.time}</Text>
                  <Pill tone={tone}>{slot.used}/{slot.capacity} {full ? 'FULL' : 'OPEN'}</Pill>
                </Row>
                <View style={styles.capacityTrack}>
                  <View style={[styles.capacityFill, { width: `${Math.min(100, (slot.used / slot.capacity) * 100)}%`, backgroundColor: color }]} />
                </View>
              </View>
            );
          })}
        </View>
        <ActionButton secondary onPress={expandPeak} disabled={expanded}>
          {expanded ? 'Afternoon window expanded (+2)' : 'Expand afternoon capacity by 2'}
        </ActionButton>
      </Card>

      <Card>
        <Row style={styles.sectionHeader}>
          <SectionTitle title="Load by service" detail="Sample volume handled today" />
          <Text style={styles.totalLoad}>384 kg</Text>
        </Row>
        <View style={styles.breakdownTrack}>
          {SERVICE_LOAD.map((item) => (
            <View key={item.name} style={{ width: `${item.share}%`, backgroundColor: item.color }} />
          ))}
        </View>
        <View style={styles.serviceList}>
          {SERVICE_LOAD.map((item) => (
            <Row key={item.name} style={styles.serviceLine}>
              <View style={[styles.serviceDot, { backgroundColor: item.color }]} />
              <Text style={styles.serviceName}>{item.name}</Text>
              <Text style={styles.serviceWeight}>{item.weight} kg · {item.share}%</Text>
            </Row>
          ))}
        </View>
      </Card>

      <Card>
        <Row style={styles.activityHeader}>
          <SectionTitle title="Live floor log" detail="Recent staff activity" />
          <Pill tone="blue">SAMPLE</Pill>
        </Row>
        <View style={styles.activityList}>
          {RECENT_ACTIVITY.map((activity) => (
            <View key={activity.staff + activity.time} style={styles.activity}>
              <View style={styles.activityAvatar}><Text style={styles.activityInitial}>{activity.staff.slice(0, 1)}</Text></View>
              <View style={styles.activityCopy}>
                <Row style={styles.activityTitle}>
                  <Text style={styles.activityStaff}>{activity.staff}</Text>
                  <Text style={styles.activityTime}>{activity.time}</Text>
                </Row>
                <Text style={styles.activityDescription}>{activity.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle title="Staff & admin invites" detail="Generate one-time registration codes for store accounts." />
        <View style={styles.inviteRoles}>
          {(['staff', 'admin'] as const).map((role) => {
            const selected = inviteRole === role;
            return (
              <Text
                key={role}
                accessibilityRole="button"
                onPress={() => setInviteRole(role)}
                style={[styles.inviteRole, selected && styles.inviteRoleSelected]}>
                {role === 'staff' ? 'Staff account' : 'Admin account'}
              </Text>
            );
          })}
        </View>
        <ActionButton onPress={generateInvite}>Generate {inviteRole} invite</ActionButton>
        {newInvite ? (
          <View style={styles.newInvite}>
            <Text style={styles.inviteHelp}>Share this one-time code with the new {inviteRole}:</Text>
            <Text selectable style={styles.inviteCode}>{newInvite}</Text>
          </View>
        ) : null}
        {invites.length > 0 ? (
          <View style={styles.inviteList}>
            <Text style={styles.inviteHelp}>Pending invitations on this device</Text>
            {invites.map((invite) => (
              <Row key={invite.code} style={styles.inviteLine}>
                <Text style={styles.inviteCodeSmall}>{invite.code}</Text>
                <Pill tone="neutral">{invite.role.toUpperCase()}</Pill>
              </Row>
            ))}
          </View>
        ) : null}
        <Text style={styles.inviteDisclaimer}>Prototype only: invite codes are local to this running app and are not secure authentication tokens.</Text>
      </Card>

      <Text style={styles.sampleNote}>Dashboard figures and activity are sample data and are not connected to a live store database.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  liveCard: { backgroundColor: '#f0f8fc' },
  liveHeader: { gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.green },
  liveLabel: { flex: 1, color: Colors.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  machineCount: { color: Colors.ink, fontSize: 16, fontWeight: '800' },
  machineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  machine: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#d8e0e7' },
  machineActive: { backgroundColor: Colors.green },
  metrics: { flexDirection: 'row', gap: 9 },
  slotList: { gap: 13 },
  slot: { gap: 7 },
  slotHeader: { justifyContent: 'space-between' },
  slotTime: { color: Colors.ink, fontSize: 11, fontWeight: '600' },
  capacityTrack: { height: 7, borderRadius: 8, backgroundColor: '#edf1f4', overflow: 'hidden' },
  capacityFill: { height: '100%', borderRadius: 8 },
  sectionHeader: { alignItems: 'flex-start', justifyContent: 'space-between' },
  totalLoad: { color: Colors.muted, fontSize: 11, fontWeight: '700' },
  breakdownTrack: { height: 10, borderRadius: 8, overflow: 'hidden', flexDirection: 'row' },
  serviceList: { gap: 10 },
  serviceLine: { gap: 8 },
  serviceDot: { width: 10, height: 10, borderRadius: 5 },
  serviceName: { flex: 1, color: Colors.ink, fontSize: 10, fontWeight: '600' },
  serviceWeight: { color: Colors.muted, fontSize: 10 },
  activityHeader: { justifyContent: 'space-between', alignItems: 'flex-start' },
  activityList: { gap: 15 },
  activity: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  activityAvatar: { width: 29, height: 29, borderRadius: 15, backgroundColor: Colors.paleBlue, alignItems: 'center', justifyContent: 'center' },
  activityInitial: { color: Colors.primaryDark, fontSize: 11, fontWeight: '800' },
  activityCopy: { flex: 1, gap: 4 },
  activityTitle: { justifyContent: 'space-between' },
  activityStaff: { color: Colors.ink, fontSize: 11, fontWeight: '700' },
  activityTime: { color: Colors.muted, fontSize: 10 },
  activityDescription: { color: Colors.muted, fontSize: 10, lineHeight: 15 },
  sampleNote: { color: Colors.muted, textAlign: 'center', fontSize: 10, lineHeight: 15, paddingHorizontal: 10 },
  inviteRoles: { flexDirection: 'row', gap: 8 },
  inviteRole: { flex: 1, overflow: 'hidden', textAlign: 'center', color: Colors.muted, fontSize: 10, fontWeight: '600', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 11 },
  inviteRoleSelected: { color: Colors.primaryDark, borderColor: Colors.primary, backgroundColor: Colors.paleBlue, fontWeight: '700' },
  newInvite: { alignItems: 'center', gap: 5, backgroundColor: '#f0f8fc', borderRadius: 12, padding: 12 },
  inviteHelp: { color: Colors.muted, fontSize: 10, lineHeight: 15 },
  inviteCode: { color: Colors.primaryDark, fontSize: 20, fontWeight: '800', letterSpacing: 1.1 },
  inviteList: { gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 11 },
  inviteLine: { justifyContent: 'space-between' },
  inviteCodeSmall: { color: Colors.ink, fontSize: 11, fontWeight: '700' },
  inviteDisclaimer: { color: Colors.muted, fontSize: 9, lineHeight: 14 },
});
