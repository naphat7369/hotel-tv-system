import re

with open('src/pages/GuestServices.tsx', 'r') as f:
    content = f.read()

# 1. Update EMPTY_FORM
content = content.replace(
    "isActive: true,",
    "isActive: true,\n  enabled: true,"
)

# 2. Add GuestMenuItem fields (if not already there, wait, GuestMenuItem type is in api.ts, I'll patch api.ts too)

# 3. Add guestServicesEnabled state and fetch logic
state_replacement = """
  const [editingItem, setEditingItem] = useState<GuestMenuItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [customEmojis, setCustomEmojis] = useState<string[]>([]);
  const [guestServicesEnabled, setGuestServicesEnabled] = useState({
    services: true,
    dining: true,
    localGuide: true,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsData, settingsData] = await Promise.all([
        api.getGuestMenuItems(),
        api.getSettings()
      ]);
      setItems(itemsData);
      if (settingsData.guestServicesEnabled) {
        setGuestServicesEnabled(settingsData.guestServicesEnabled);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleCategory = async (section: string, checked: boolean) => {
    const key = section === 'local_guide' ? 'localGuide' : section;
    const oldState = { ...guestServicesEnabled };
    const newState = { ...oldState, [key]: checked };
    setGuestServicesEnabled(newState);
    
    try {
      const formData = new FormData();
      formData.append('guestServicesEnabled', JSON.stringify(newState));
      await api.updateSettings(formData);
    } catch (err) {
      console.error(err);
      setGuestServicesEnabled(oldState);
      alert('Failed to update category setting');
    }
  };
"""

content = re.sub(
    r'const \[editingItem.*?useEffect\(\(\) => \{ fetchItems\(\); \}, \[\]\);',
    state_replacement,
    content,
    flags=re.DOTALL
)

# 4. Replace section description with category header and toggle
header_orig = r'\{\/\* Section description \*\/\}\n\s*<p className="text-xs text-on-surface-variant -mt-2 px-1">\n\s*\{SECTIONS\.find\(s => s\.key === activeSection\)\?\.desc\}\n\s*</p>'
header_new = """
      {/* Category Header with Toggle */}
      <div className="flex items-center justify-between mt-4 px-1">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{SECTIONS.find(s => s.key === activeSection)?.label}</h3>
          <p className="text-sm text-[#94a3b8]">
            {SECTIONS.find(s => s.key === activeSection)?.desc}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[#131f2b] border border-[#1e2d3d] px-4 py-2.5 rounded-xl">
          <span className="text-sm font-bold text-white">Category Enabled</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={guestServicesEnabled[activeSection === 'local_guide' ? 'localGuide' : activeSection as keyof typeof guestServicesEnabled]} 
              onChange={(e) => toggleCategory(activeSection, e.target.checked)} 
            />
            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#5fd4f0] after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>
"""
content = re.sub(header_orig, header_new, content)

# 5. Fix card mapping to show "Disabled" overlay
card_orig = r'(<div key=\{item\.id\} className="group relative bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0\.5">)'
card_new = r'<div key={item.id} className={`group relative bg-surface-container-lowest rounded-xl border overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${item.enabled === false ? "border-red-900/50 grayscale opacity-80" : "border-outline-variant"}`}>\n                {item.enabled === false && <div className="absolute top-2 left-2 z-30 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md uppercase tracking-wide">ปิดใช้งาน</div>}'
content = re.sub(card_orig, card_new, content)

# 6. Add Item Toggle to Modal (Edit Form Placement section)
placement_orig = r'\{/\* 1\. Placement \*/\}'
placement_new = """{/* 1. Placement */}
                <div className="mb-6 flex items-center justify-between bg-[#5fd4f0]/5 border border-[#5fd4f0]/20 p-4 rounded-xl">
                  <div className="flex flex-col">
                    <span className="font-bold text-[0.875rem] text-[#5fd4f0]">เปิดใช้งานรายการนี้</span>
                    <span className="text-xs text-[#94a3b8]">Enable this item</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={form.enabled !== false} 
                      onChange={(e) => setForm(p => ({ ...p, enabled: e.target.checked }))} 
                    />
                    <div className="w-11 h-6 bg-[#1e2d3d] rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#5fd4f0] after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  </label>
                </div>
                """
content = content.replace(placement_orig, placement_new)

# 7. Add `enabled: item.enabled ?? true,` to openEdit
openEdit_orig = r'isActive: item\.isActive,'
openEdit_new = 'isActive: item.isActive,\n      enabled: item.enabled !== false,'
content = content.replace(openEdit_orig, openEdit_new)

# 8. Add `enabled: form.enabled,` to handleSave payload
handleSave_orig = r'isActive: form\.isActive,'
handleSave_new = 'isActive: form.isActive,\n      enabled: form.enabled,'
content = content.replace(handleSave_orig, handleSave_new)

with open('src/pages/GuestServices.tsx', 'w') as f:
    f.write(content)

# Now patch api.ts for the GuestMenuItem type
with open('src/lib/api.ts', 'r') as f:
    api_content = f.read()

api_content = api_content.replace('isActive: boolean;', 'isActive: boolean;\n  enabled?: boolean;')
with open('src/lib/api.ts', 'w') as f:
    f.write(api_content)
