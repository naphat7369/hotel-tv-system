import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  Save,
  Bell,
  ShieldAlert,
  Send,
  VolumeX,
  RefreshCw,
  Clock,
  Sliders,
} from 'lucide-react';

export default function IncidentSettings() {
  // NOTE (ข้อจำกัดชั่วคราว / Temporary Limitation):
  // การเก็บ Admin API Key ใน localStorage เป็นข้อจำกัดชั่วคราวระหว่างที่ระบบ CMS ยังไม่มีระบบ Login/Session
  const [adminKey, setAdminKey] = useState<string>(() => api.getIncidentAdminKey());
  const [incidentError, setIncidentError] = useState<string>('');
  const [incidentSuccess, setIncidentSuccess] = useState<string>('');
  const [incidentSaving, setIncidentSaving] = useState<boolean>(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  const [incConfig, setIncConfig] = useState<any>({
    enabled: false,
    muteUntil: null,
    telegramEnabled: true,
    telegramBotToken: '',
    telegramBotTokenIsSet: false,
    telegramChatId: '',
    telegramMinSeverity: 'INFO',
    emailEnabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpPassIsSet: false,
    alertEmailFrom: '',
    alertEmailTo: '',
    emailMinSeverity: 'WARNING',
    maintenanceWindowStart: '03:58',
    maintenanceWindowEnd: '04:06',
    maintenanceBufferMinutes: 2,
    iptvGracePeriodMinutes: 3,
    flappingWindowMinutes: 10,
    roomBatchWindowSeconds: 45,
    stormThresholdRooms: 10,
    alertCooldownMinutes: 15,
    escalationMinutes: 60,
  });

  useEffect(() => {
    if (api.getIncidentAdminKey()) {
      loadIncidentData();
    }
  }, []);

  const loadIncidentData = async () => {
    setIncidentError('');
    try {
      const cfg = await api.getIncidentConfig();
      setIncConfig((prev: any) => ({ ...prev, ...cfg }));
      const recent = await api.getRecentIncidents(25);
      setRecentIncidents(Array.isArray(recent?.incidents) ? recent.incidents : []);
    } catch (err: any) {
      setIncidentError(err?.message || 'ไม่สามารถโหลดข้อมูลการตั้งค่า Incident ได้');
    }
  };

  const handleAdminKeySaveAndLoad = async () => {
    api.setIncidentAdminKey(adminKey);
    await loadIncidentData();
  };

  const handleSaveIncidentConfig = async () => {
    setIncidentSaving(true);
    setIncidentError('');
    setIncidentSuccess('');
    try {
      api.setIncidentAdminKey(adminKey);
      const res = await api.updateIncidentConfig(incConfig);
      if (res?.config) {
        setIncConfig((prev: any) => ({ ...prev, ...res.config }));
      }
      setIncidentSuccess('บันทึกการตั้งค่าระบบแจ้งเตือน Incident สำเร็จ!');
    } catch (err: any) {
      setIncidentError(err?.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      setIncidentSaving(false);
    }
  };

  const handleMute = async (durationMinutes: number) => {
    setIncidentError('');
    setIncidentSuccess('');
    try {
      api.setIncidentAdminKey(adminKey);
      const res = await api.muteIncidents(durationMinutes);
      if (res?.config) {
        setIncConfig((prev: any) => ({ ...prev, ...res.config }));
      } else if (res?.muteUntil !== undefined) {
        setIncConfig((prev: any) => ({ ...prev, muteUntil: res.muteUntil }));
      }
      setIncidentSuccess(
        durationMinutes > 0
          ? `ปิดเสียงแจ้งเตือนชั่วคราวเป็นเวลา ${durationMinutes / 60} ชั่วโมงแล้ว`
          : 'ยกเลิกการปิดเสียงชั่วคราว (Unmuted) เรียบร้อยแล้ว'
      );
    } catch (err: any) {
      setIncidentError(err?.message || 'ตั้งค่า Mute ไม่สำเร็จ');
    }
  };

  const handleTestNotification = async (channel: 'telegram' | 'email') => {
    setTestingChannel(channel);
    setIncidentError('');
    setIncidentSuccess('');
    try {
      api.setIncidentAdminKey(adminKey);
      const res = await api.testIncidentNotification(channel);
      if (res?.success) {
        setIncidentSuccess(
          `ส่งข้อความทดสอบผ่าน ${channel === 'telegram' ? 'Telegram' : 'Email'} สำเร็จแล้ว!`
        );
      } else {
        setIncidentError(
          `ส่งข้อความทดสอบผ่าน ${channel === 'telegram' ? 'Telegram' : 'Email'} ไม่สำเร็จ กรุณาตรวจสอบ Token/Chat ID หรือค่า SMTP`
        );
      }
    } catch (err: any) {
      setIncidentError(err?.message || 'การทดสอบส่งแจ้งเตือนล้มเหลว');
    } finally {
      setTestingChannel(null);
    }
  };

  const getMuteStatusLabel = (): string => {
    if (!incConfig.muteUntil) return 'ไม่ได้ปิดเสียง (Active)';
    const untilMs = new Date(incConfig.muteUntil).getTime();
    const diffMs = untilMs - Date.now();
    if (Number.isNaN(untilMs) || diffMs <= 0) return 'ไม่ได้ปิดเสียง (Active)';
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const remainingText =
      hours > 0 ? `เหลืออีก ${hours} ชม. ${minutes} นาที` : `เหลืออีก ${minutes} นาที`;
    const timeStr = new Date(incConfig.muteUntil).toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
    });
    return `ถึง ${timeStr} (${remainingText})`;
  };

  const filteredIncidents = recentIncidents.filter((inc: any) => {
    if (filterStatus !== 'ALL' && inc.status !== filterStatus) return false;
    if (filterSeverity !== 'ALL' && inc.severity !== filterSeverity) return false;
    if (filterCategory !== 'ALL' && inc.category !== filterCategory) return false;
    return true;
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-on-surface mb-2 flex items-center gap-3">
            <Bell className="text-primary" size={28} />
            <span>Incident Notification Settings</span>
          </h1>
          <p className="text-on-surface-variant">
            ตั้งค่าระบบแจ้งเตือนเหตุขัดข้องอัจฉริยะผ่าน Telegram และ Email (Maintenance Window 03:58–04:06 + Buffer 2 นาที)
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveIncidentConfig}
          disabled={incidentSaving}
          className="bg-primary hover:bg-primary/90 text-on-primary px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          <Save size={20} />
          <span>{incidentSaving ? 'กำลังบันทึก...' : 'Save Incident Config'}</span>
        </button>
      </div>

      <div className="bg-surface-container p-6 rounded-xl border border-outline-variant shadow-sm space-y-6">
        {/* Admin API Key input (stored in localStorage as a temporary limitation) */}
        <div className="bg-surface p-4 rounded-lg border border-outline-variant">
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Admin API Key (สำหรับยืนยันสิทธิ์จัดการระบบแจ้งเตือน — เก็บใน localStorage เป็นข้อจำกัดชั่วคราว)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="กรอก ADMIN_API_KEY ที่ตั้งไว้ใน server/.env"
              className="flex-1 min-w-[240px] bg-surface-container border border-outline rounded-lg px-3 py-2 text-sm text-on-surface"
            />
            <button
              type="button"
              onClick={handleAdminKeySaveAndLoad}
              className="bg-secondary/20 hover:bg-secondary/30 text-on-surface px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 border border-outline-variant"
            >
              <RefreshCw size={15} />
              <span>บันทึก Key & โหลดข้อมูล</span>
            </button>
          </div>
        </div>

        {incidentError && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
            <ShieldAlert size={18} className="shrink-0" />
            <span>{incidentError}</span>
          </div>
        )}

        {incidentSuccess && (
          <div className="bg-green-500/10 border border-green-500/40 text-green-400 px-4 py-3 rounded-lg text-sm">
            {incidentSuccess}
          </div>
        )}

        {/* Master Kill Switch & Mute Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface p-4 rounded-lg border border-outline-variant">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-on-surface text-sm">
                เปิดใช้งานระบบแจ้งเตือน (Enable Incident System / Kill Switch)
              </div>
              <div className="text-xs text-on-surface-variant">
                สถานะปัจจุบัน:{' '}
                {incConfig.enabled ? '🟢 เปิดใช้งาน (Enabled)' : '⚪ ปิดไว้ (Disabled)'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(incConfig.enabled)}
              onChange={(e) => setIncConfig({ ...incConfig, enabled: e.target.checked })}
              className="h-5 w-5 accent-primary cursor-pointer"
            />
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2 text-xs text-on-surface-variant">
              <VolumeX size={14} />
              <span>สถานะ Mute ชั่วคราว: {getMuteStatusLabel()}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleMute(60)}
                className="px-2.5 py-1 text-xs rounded bg-surface-container border border-outline hover:border-primary text-on-surface"
              >
                Mute 1 ชม.
              </button>
              <button
                type="button"
                onClick={() => handleMute(240)}
                className="px-2.5 py-1 text-xs rounded bg-surface-container border border-outline hover:border-primary text-on-surface"
              >
                Mute 4 ชม.
              </button>
              <button
                type="button"
                onClick={() => handleMute(480)}
                className="px-2.5 py-1 text-xs rounded bg-surface-container border border-outline hover:border-primary text-on-surface"
              >
                Mute 8 ชม.
              </button>
              <button
                type="button"
                onClick={() => handleMute(0)}
                className="px-2.5 py-1 text-xs rounded bg-green-600/20 border border-green-500/40 text-green-300"
              >
                Unmute (ยกเลิก)
              </button>
            </div>
          </div>
        </div>

        {/* Telegram & Email Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Telegram Card */}
          <div className="bg-surface p-4 rounded-lg border border-outline-variant space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-on-surface">Telegram Bot Alerting</span>
              <input
                type="checkbox"
                checked={Boolean(incConfig.telegramEnabled)}
                onChange={(e) =>
                  setIncConfig({ ...incConfig, telegramEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Bot Token{' '}
                <span
                  className={
                    incConfig.telegramBotTokenIsSet ? 'text-green-400' : 'text-amber-400'
                  }
                >
                  {incConfig.telegramBotTokenIsSet
                    ? '(Set ✅ — เว้นว่างได้หากไม่เปลี่ยน)'
                    : '(Not Set)'}
                </span>
              </label>
              <input
                type="password"
                value={incConfig.telegramBotToken || ''}
                onChange={(e) =>
                  setIncConfig({ ...incConfig, telegramBotToken: e.target.value })
                }
                placeholder={incConfig.telegramBotTokenIsSet ? '********' : '123456:ABC-DEF...'}
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Chat ID (Group / User)
                </label>
                <input
                  type="text"
                  value={incConfig.telegramChatId || ''}
                  onChange={(e) =>
                    setIncConfig({ ...incConfig, telegramChatId: e.target.value })
                  }
                  placeholder="-1001234567890"
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Minimum Severity
                </label>
                <select
                  value={incConfig.telegramMinSeverity || 'INFO'}
                  onChange={(e) =>
                    setIncConfig({ ...incConfig, telegramMinSeverity: e.target.value })
                  }
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                >
                  <option value="INFO">INFO ขึ้นไป (ทั้งหมด)</option>
                  <option value="WARNING">WARNING ขึ้นไป</option>
                  <option value="CRITICAL">เฉพาะ CRITICAL</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleTestNotification('telegram')}
              disabled={testingChannel === 'telegram'}
              className="w-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 py-1.5 rounded text-xs font-medium flex items-center justify-center space-x-1"
            >
              <Send size={13} />
              <span>
                {testingChannel === 'telegram'
                  ? 'กำลังส่งทดสอบ...'
                  : 'Test Telegram (ใช้งานได้แม้ปิดระบบหลัก/Mute)'}
              </span>
            </button>
          </div>

          {/* Email SMTP Card */}
          <div className="bg-surface p-4 rounded-lg border border-outline-variant space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-on-surface">
                Email (SMTP) Alerting
              </span>
              <input
                type="checkbox"
                checked={Boolean(incConfig.emailEnabled)}
                onChange={(e) => setIncConfig({ ...incConfig, emailEnabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-on-surface-variant mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={incConfig.smtpHost || ''}
                  onChange={(e) => setIncConfig({ ...incConfig, smtpHost: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">Port</label>
                <input
                  type="number"
                  value={incConfig.smtpPort || 587}
                  onChange={(e) =>
                    setIncConfig({ ...incConfig, smtpPort: parseInt(e.target.value, 10) || 587 })
                  }
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">SMTP User</label>
                <input
                  type="text"
                  value={incConfig.smtpUser || ''}
                  onChange={(e) => setIncConfig({ ...incConfig, smtpUser: e.target.value })}
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  SMTP Password{' '}
                  <span
                    className={incConfig.smtpPassIsSet ? 'text-green-400' : 'text-amber-400'}
                  >
                    {incConfig.smtpPassIsSet ? '(Set ✅)' : '(Not Set)'}
                  </span>
                </label>
                <input
                  type="password"
                  value={incConfig.smtpPass || ''}
                  onChange={(e) => setIncConfig({ ...incConfig, smtpPass: e.target.value })}
                  placeholder={incConfig.smtpPassIsSet ? '********' : 'รหัสผ่าน SMTP'}
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Recipient Emails (คั่นด้วย ,)
                </label>
                <input
                  type="text"
                  value={incConfig.alertEmailTo || ''}
                  onChange={(e) => setIncConfig({ ...incConfig, alertEmailTo: e.target.value })}
                  placeholder="it@hotel.com, support@hotel.com"
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Minimum Severity
                </label>
                <select
                  value={incConfig.emailMinSeverity || 'WARNING'}
                  onChange={(e) =>
                    setIncConfig({ ...incConfig, emailMinSeverity: e.target.value })
                  }
                  className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
                >
                  <option value="WARNING">WARNING ขึ้นไป (แนะนำ)</option>
                  <option value="CRITICAL">เฉพาะ CRITICAL</option>
                  <option value="INFO">INFO ขึ้นไป</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleTestNotification('email')}
              disabled={testingChannel === 'email'}
              className="w-full bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 py-1.5 rounded text-xs font-medium flex items-center justify-center space-x-1"
            >
              <Send size={13} />
              <span>
                {testingChannel === 'email'
                  ? 'กำลังส่งทดสอบ...'
                  : 'Test Email (ใช้งานได้แม้ปิดระบบหลัก/Mute)'}
              </span>
            </button>
          </div>
        </div>

        {/* Maintenance Window, Grace Period & Alert Storm Thresholds */}
        <div className="bg-surface p-4 rounded-lg border border-outline-variant space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-on-surface">
            <Clock size={16} className="text-primary" />
            <span>
              Maintenance Window (Asia/Bangkok), Grace Period & Alert Storm Thresholds
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Maintenance Start (HH:mm)
              </label>
              <input
                type="text"
                value={incConfig.maintenanceWindowStart || '03:58'}
                onChange={(e) =>
                  setIncConfig({ ...incConfig, maintenanceWindowStart: e.target.value })
                }
                placeholder="03:58"
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Maintenance End (HH:mm)
              </label>
              <input
                type="text"
                value={incConfig.maintenanceWindowEnd || '04:06'}
                onChange={(e) =>
                  setIncConfig({ ...incConfig, maintenanceWindowEnd: e.target.value })
                }
                placeholder="04:06"
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Buffer ท้ายช่วง (นาที)
              </label>
              <input
                type="number"
                value={incConfig.maintenanceBufferMinutes ?? 2}
                onChange={(e) =>
                  setIncConfig({
                    ...incConfig,
                    maintenanceBufferMinutes: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                IPTV Grace Period (นาที)
              </label>
              <input
                type="number"
                value={incConfig.iptvGracePeriodMinutes ?? 3}
                onChange={(e) =>
                  setIncConfig({
                    ...incConfig,
                    iptvGracePeriodMinutes: parseInt(e.target.value, 10) || 3,
                  })
                }
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Room Batching (วินาที)
              </label>
              <input
                type="number"
                value={incConfig.roomBatchWindowSeconds ?? 45}
                onChange={(e) =>
                  setIncConfig({
                    ...incConfig,
                    roomBatchWindowSeconds: parseInt(e.target.value, 10) || 45,
                  })
                }
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Alert Storm Threshold (ห้อง)
              </label>
              <input
                type="number"
                value={incConfig.stormThresholdRooms ?? 10}
                onChange={(e) =>
                  setIncConfig({
                    ...incConfig,
                    stormThresholdRooms: parseInt(e.target.value, 10) || 10,
                  })
                }
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Alert Cooldown (นาที)
              </label>
              <input
                type="number"
                value={incConfig.alertCooldownMinutes ?? 15}
                onChange={(e) =>
                  setIncConfig({
                    ...incConfig,
                    alertCooldownMinutes: parseInt(e.target.value, 10) || 15,
                  })
                }
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Escalation Reminder (นาที)
              </label>
              <input
                type="number"
                value={incConfig.escalationMinutes ?? 60}
                onChange={(e) =>
                  setIncConfig({
                    ...incConfig,
                    escalationMinutes: parseInt(e.target.value, 10) || 60,
                  })
                }
                className="w-full bg-surface-container border border-outline rounded px-3 py-1.5 text-sm text-on-surface"
              />
            </div>
          </div>
        </div>

        {/* Recent Incidents Table (Always Visible) */}
        <div className="bg-surface p-4 rounded-lg border border-outline-variant space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Sliders size={15} className="text-primary" />
              <h3 className="text-sm font-semibold text-on-surface">
                ประวัติเหตุขัดข้องล่าสุด (Recent Incidents History)
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-surface-container border border-outline rounded px-2 py-1 text-on-surface"
              >
                <option value="ALL">ทุกสถานะ (Status)</option>
                <option value="OPEN">OPEN</option>
                <option value="FLAPPING">FLAPPING</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>

              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="bg-surface-container border border-outline rounded px-2 py-1 text-on-surface"
              >
                <option value="ALL">ทุกระดับ (Severity)</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="WARNING">WARNING</option>
                <option value="INFO">INFO</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-surface-container border border-outline rounded px-2 py-1 text-on-surface"
              >
                <option value="ALL">ทุกหมวดหมู่ (Category)</option>
                <option value="CORE">CORE</option>
                <option value="IPTV">IPTV</option>
                <option value="TV_BOX">TV_BOX</option>
                <option value="ADB">ADB</option>
              </select>

              <button
                type="button"
                onClick={loadIncidentData}
                className="bg-surface-container hover:bg-surface-container-high border border-outline rounded px-2.5 py-1 text-on-surface flex items-center space-x-1"
              >
                <RefreshCw size={12} />
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-on-surface">
              <thead className="border-b border-outline-variant text-on-surface-variant">
                <tr>
                  <th className="py-2 pr-3">เวลา (Asia/Bangkok)</th>
                  <th className="py-2 pr-3">หมวดหมู่</th>
                  <th className="py-2 pr-3">ความรุนแรง</th>
                  <th className="py-2 pr-3">สถานะ</th>
                  <th className="py-2 pr-3">หัวข้อ</th>
                  <th className="py-2">การส่ง (Telegram / Email)</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-4 text-center text-on-surface-variant italic"
                    >
                      ยังไม่มีประวัติเหตุขัดข้องในระบบ (หรือกรอก Admin API Key ด้านบนแล้วกด "บันทึก Key & โหลดข้อมูล")
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.map((inc: any) => (
                    <tr
                      key={inc.id || inc.incidentId}
                      className="border-b border-outline-variant/40"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {inc.occurredAt || inc.openedAt
                          ? new Date(inc.occurredAt || inc.openedAt).toLocaleString('th-TH', {
                              timeZone: 'Asia/Bangkok',
                            })
                          : '-'}
                      </td>
                      <td className="py-2 pr-3">
                        {inc.category}/{inc.type}
                      </td>
                      <td className="py-2 pr-3 font-medium">{inc.severity}</td>
                      <td className="py-2 pr-3">{inc.status}</td>
                      <td className="py-2 pr-3">{inc.title}</td>
                      <td className="py-2 whitespace-nowrap">
                        {inc.telegramStatus} / {inc.emailStatus}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

