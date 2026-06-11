import React, { useState, useEffect } from 'react';

const DEFAULT_MARQUEE_TEXT = 'Welcome to S31 Hotel Sukhumvit! Experience our new Ice Bath & Sauna facilities on the wellness floor today. ❄️ | Join our special Happy Hour at the Bar from 5 PM to 7 PM. 🍸';

interface SavedMessage {
  id: string;
  message: string;
  type: string;
  createdAt: string;
}

interface ActiveBroadcast {
  id: string;
  message: string;
  type: string;
  target: string;
  targetRoom: string | null;
  targetFloor: number | null;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
}

export const BroadcastManagement = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'schedules'>('create');
  
  // Create Form State
  const [type, setType] = useState('default');
  const [message, setMessage] = useState(DEFAULT_MARQUEE_TEXT);
  const [target, setTarget] = useState('all');
  const [targetFloor, setTargetFloor] = useState('1');
  const [targetRoom, setTargetRoom] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>([]);
  const [activeBroadcasts, setActiveBroadcasts] = useState<ActiveBroadcast[]>([]);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    fetchSavedMessages();
    fetchActiveBroadcasts();
  }, []);

  const fetchSavedMessages = async () => {
    try {
      const backendUrl = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${backendUrl}/api/v1/broadcast/messages`);
      if (res.ok) {
        const data = await res.json();
        setSavedMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch saved messages', err);
    }
  };

  const fetchActiveBroadcasts = async () => {
    try {
      const backendUrl = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${backendUrl}/api/v1/broadcast/active`);
      if (res.ok) {
        const data = await res.json();
        setActiveBroadcasts(data);
      }
    } catch (err) {
      console.error('Failed to fetch active broadcasts', err);
    }
  };

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (newType === 'default') {
      setMessage(DEFAULT_MARQUEE_TEXT);
    } else if (newType === 'alert') {
      setMessage('SCHEDULED SYSTEM MAINTENANCE.\nThe system will be briefly unavailable today between 2:00 PM and 3:00 PM for essential updates. We apologize for any inconvenience.');
    } else {
      setMessage('');
    }
  };

  const handleTranslate = async () => {
    if (!message.trim()) return;
    setTranslating(true);
    try {
      const baseMessage = message.split('|')[0].trim();
      
      const resEn = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=en&dt=t&q=${encodeURIComponent(baseMessage)}`);
      const dataEn = await resEn.json();
      const textEn = dataEn[0].map((x: any) => x[0]).join('');
      
      const resZh = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=zh-CN&dt=t&q=${encodeURIComponent(baseMessage)}`);
      const dataZh = await resZh.json();
      const textZh = dataZh[0].map((x: any) => x[0]).join('');

      setMessage(`${baseMessage}   |   ${textEn}   |   ${textZh}`);
    } catch (e) {
      console.error(e);
      alert('ไม่สามารถแปลภาษาได้ในขณะนี้');
    } finally {
      setTranslating(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    setLoading(true);
    const backendUrl = `http://${window.location.hostname}:3000`;

    try {
      if (type === 'custom' && saveAsPreset) {
        await fetch(`${backendUrl}/api/v1/broadcast/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, type: 'custom' })
        });
        await fetchSavedMessages();
      }

      const res = await fetch(`${backendUrl}/api/v1/broadcast/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message,
          target,
          targetRoom: target === 'room' ? targetRoom : null,
          targetFloor: target === 'floor' ? targetFloor : null,
          startTime: startTime || null,
          endTime: endTime || null
        })
      });

      if (res.ok) {
        alert('Broadcast added successfully!');
        setStartTime('');
        setEndTime('');
        fetchActiveBroadcasts();
        setActiveTab('schedules');
      } else {
        alert('Failed to send broadcast');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setLoading(false);
      setSaveAsPreset(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('Are you sure you want to stop/delete this broadcast?')) return;
    try {
      const backendUrl = `http://${window.location.hostname}:3000`;
      const res = await fetch(`${backendUrl}/api/v1/broadcast/active/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchActiveBroadcasts();
      } else {
        alert('Failed to delete broadcast');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-inter transition-colors duration-300">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-on-surface" style={{ fontFamily: 'Outfit, sans-serif' }}>Broadcast Management</h1>
        <p className="text-on-surface-variant font-normal">ตั้งค่าการประกาศบนทีวี และจัดการตารางการแสดงผลอย่างมืออาชีพ</p>
      </header>

      {/* Main Content Grid (Only used for Create tab, Schedules takes full width) */}
      {activeTab === 'create' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Form & Tabs */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-300">
            {/* Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded-xl mb-8 border border-slate-200 dark:border-slate-700/50">
              <button 
                onClick={() => setActiveTab('create')} 
                className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'create' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
              >
                สร้างประกาศใหม่ (Create)
              </button>
              <button 
                onClick={() => setActiveTab('schedules')} 
                className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'schedules' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
              >
                รายการออกอากาศ (Schedules)
                <span className={`text-xs py-0.5 px-2 rounded-full font-bold ml-1 ${activeTab === 'schedules' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{activeBroadcasts.length}</span>
              </button>
            </div>

            <div className="space-y-6 animate-fade-in">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">หมวดหมู่ข้อความ (Message Type)</label>
                <select 
                  value={type} 
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300"
                >
                  <option value="alert">Alert (แจ้งเตือนเป็น Popup Modal กลางจอ)</option>
                  <option value="default">Default (ตัวหนังสือวิ่งปกติ)</option>
                  <option value="custom">Custom (เขียนประโยควิ่งเอง)</option>
                </select>
              </div>

              {/* Message Content */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ข้อความที่จะประกาศ (Message)</label>
                  <button 
                    onClick={handleTranslate}
                    disabled={translating || !message}
                    className="text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">translate</span> 
                    {translating ? 'กำลังแปล...' : 'แปลภาษาอัตโนมัติ'}
                  </button>
                </div>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-xl p-4 min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-300" 
                  placeholder="พิมพ์ข้อความที่นี่..."
                />
                
                {type === 'custom' && (
                  <div className="mt-3 p-4 bg-blue-50 dark:bg-slate-900 rounded-xl border border-blue-100 dark:border-slate-700 transition-colors duration-300">
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input 
                        type="checkbox" 
                        checked={saveAsPreset}
                        onChange={(e) => setSaveAsPreset(e.target.checked)}
                        className="text-blue-600 focus:ring-blue-500 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">บันทึกเป็น Custom Presets</span>
                    </label>
                    {savedMessages.length > 0 && (
                      <select 
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-200 rounded-lg p-2 text-sm focus:ring-blue-500 transition-colors duration-300"
                        onChange={(e) => {
                          if(e.target.value) setMessage(e.target.value);
                        }}
                      >
                        <option value="">-- เลือกจากข้อความที่เคยบันทึกไว้ --</option>
                        {savedMessages.map(msg => (
                          <option key={msg.id} value={msg.message}>
                            {msg.message.length > 50 ? msg.message.substring(0, 50) + '...' : msg.message}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Target Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">กลุ่มเป้าหมาย (Target Audience)</label>
                <div className="flex gap-4">
                  <label className={`flex-1 bg-slate-50 dark:bg-slate-900 border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors ${target === 'all' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" name="target" value="all" checked={target === 'all'} onChange={() => setTarget('all')} className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-blue-500" /> 
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">ทุกห้อง</span>
                  </label>
                  <label className={`flex-1 bg-slate-50 dark:bg-slate-900 border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors ${target === 'floor' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" name="target" value="floor" checked={target === 'floor'} onChange={() => setTarget('floor')} className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-blue-500" /> 
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">เลือกชั้น</span>
                  </label>
                  <label className={`flex-1 bg-slate-50 dark:bg-slate-900 border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors ${target === 'room' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600'}`}>
                    <input type="radio" name="target" value="room" checked={target === 'room'} onChange={() => setTarget('room')} className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-blue-500" /> 
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">ระบุห้อง</span>
                  </label>
                </div>

                {target === 'floor' && (
                  <div className="mt-3">
                    <select value={targetFloor} onChange={(e) => setTargetFloor(e.target.value)} className="w-full sm:w-1/2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm transition-colors duration-300">
                      {[...Array(10)].map((_, i) => (
                        <option key={i+1} value={i+1}>ชั้น {i+1} (Floor {i+1})</option>
                      ))}
                    </select>
                  </div>
                )}
                {target === 'room' && (
                  <div className="mt-3">
                    <input 
                      type="text" 
                      value={targetRoom}
                      onChange={(e) => setTargetRoom(e.target.value)}
                      placeholder="เช่น 101, 102" 
                      className="w-full sm:w-1/2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm transition-colors duration-300"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Settings & Actions */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live Preview */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-300">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">ตัวอย่างการแสดงผล (Live Preview)</h3>
              <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 relative h-48 flex flex-col justify-end shadow-inner" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1542314831-c6a420325142?w=800&q=80')", backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <div className="absolute inset-0 bg-black/40"></div>
                
                {type !== 'alert' ? (
                  <div className="w-full relative border-t border-b border-white/10 bg-black/60 text-white p-2" style={{ height: '40px' }}>
                    <div className="inline-block font-semibold tracking-wide animate-[marquee_20s_linear_infinite]" style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>
                      {message || 'Welcome to S31 Hotel Sukhumvit...'}
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center z-10 p-4">
                    <div className="w-full max-w-[200px] rounded-2xl p-3 text-center flex flex-col items-center" style={{ background: 'rgba(10, 10, 15, 0.85)', backdropFilter: 'blur(10px)', border: '1px solid rgba(212, 175, 55, 0.3)' }}>
                      <span className="material-symbols-outlined text-[#d4af37] mb-1" style={{ fontSize: '24px' }}>notifications_active</span>
                      <h2 className="text-white text-[10px] tracking-widest mb-1 uppercase font-bold" style={{ color: '#d4af37' }}>Announcement</h2>
                      <p className="text-gray-300 text-[8px] leading-tight mb-2 whitespace-pre-wrap">
                        {message || 'The system will be briefly unavailable...'}
                      </p>
                      <div className="flex gap-2 w-full">
                        <button className="flex-1 rounded-full py-1 text-[8px] border border-[#d4af37]/50 text-[#d4af37]">Remind</button>
                        <button className="flex-1 rounded-full py-1 text-[8px] bg-gradient-to-r from-[#d4af37] to-[#aa771c] text-black font-bold">Dismiss</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Scheduling Card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 border-l-4 border-l-blue-500 transition-colors duration-300">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-blue-400 mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700/50 pb-3">
                <span className="material-symbols-outlined">schedule</span>
                ตั้งเวลาแสดงผล (Scheduling)
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">เวลาเริ่มต้น (Start Time)</label>
                  <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm transition-colors duration-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">เวลาสิ้นสุด (End Time)</label>
                  <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2.5 text-sm transition-colors duration-300" />
                </div>
              </div>
              <div className="mt-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-500/20 rounded-lg p-3 flex gap-3 items-start">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">info</span>
                <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">หากไม่ระบุเวลา ระบบจะเริ่มแสดงผลทันทีและจะแสดงไปเรื่อยๆ จนกว่าจะถูกลบออก</p>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button 
                disabled={loading}
                onClick={handleSendBroadcast}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-all flex justify-center items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined">send</span>
                {loading ? 'กำลังส่ง...' : 'บันทึก & เพิ่มเข้าสู่ระบบ (Send/Schedule)'}
              </button>
            </div>

          </div>
        </div>
      ) : (
        /* SCHEDULES TAB (Full Width) */
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in transition-colors duration-300">
          
          {/* Tabs header for Schedules View */}
          <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1.5 rounded-xl mb-8 border border-slate-200 dark:border-slate-700/50">
            <button 
              onClick={() => setActiveTab('create')} 
              className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'create' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
            >
              สร้างประกาศใหม่ (Create)
            </button>
            <button 
              onClick={() => setActiveTab('schedules')} 
              className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'schedules' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-slate-700' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
            >
              รายการออกอากาศ (Schedules)
              <span className={`text-xs py-0.5 px-2 rounded-full font-bold ml-1 ${activeTab === 'schedules' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{activeBroadcasts.length}</span>
            </button>
          </div>

          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">list_alt</span>
              รายการออกอากาศปัจจุบัน (Active & Scheduled)
            </h3>
            <button onClick={fetchActiveBroadcasts} className="text-sm px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-900 dark:text-white flex items-center gap-1 transition-colors duration-300">
              <span className="material-symbols-outlined text-[16px]">refresh</span> รีเฟรช
            </button>
          </div>
          
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Message</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Schedule Time</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                {activeBroadcasts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      ไม่มีรายการออกอากาศ (No active broadcasts)
                    </td>
                  </tr>
                ) : activeBroadcasts.map((b) => {
                  const now = new Date();
                  const start = b.startTime ? new Date(b.startTime) : null;
                  const end = b.endTime ? new Date(b.endTime) : null;
                  const isActive = b.isActive && (!start || start <= now) && (!end || end > now);
                  
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Active Now
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm">
                            <span className="material-symbols-outlined text-[14px]">schedule</span> Scheduled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${b.type === 'alert' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}>
                          {b.type === 'alert' ? 'Alert Modal' : (b.type === 'custom' ? 'Custom' : 'Default')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 max-w-sm truncate" title={b.message}>
                        {b.message}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">Start: {start ? start.toLocaleString() : 'Immediately'}</span>
                          <span>End: {end ? end.toLocaleString() : 'Forever'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <button 
                          onClick={() => handleDeleteSchedule(b.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-red-200 dark:border-red-800"
                        >
                          {isActive ? 'Stop Broadcast' : 'Delete Schedule'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
};

export default BroadcastManagement;
