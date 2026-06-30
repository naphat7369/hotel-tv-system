# Hotel TV System — PMS Integration API Document

> **Version:** 1.0.0  
> **Base URL:** `http://<SERVER_IP>:3000/api/v1/pms`  
> **Content-Type:** `application/json`  
> **Authentication:** API Key ใน HTTP Header (แนะนำสำหรับ Production)

---

## ภาพรวม (Overview)

API นี้ใช้สำหรับให้ระบบ **PMS (Property Management System)** ส่งข้อมูลผู้เข้าพักมายัง **Hotel TV System**  
เมื่อ PMS ส่งข้อมูล Check-in ระบบจะแสดงหน้าต้อนรับพร้อมข้อมูลแขกบนทีวีในห้องนั้นทันที

```
PMS  ──POST /checkin──►  Hotel TV Server  ──WebSocket──►  TV Portal (Android TV)
PMS  ──POST /checkout──►  Hotel TV Server  ──WebSocket──►  TV Portal (แสดงหน้า Default)
```

---

## Endpoints

### 1. Check-in

**`POST /api/v1/pms/checkin`**

ส่งข้อมูลแขกเมื่อ Check-in เข้าห้องพัก ระบบจะส่ง event ไปยังทีวีในห้องนั้นทันทีผ่าน WebSocket

#### Request Body

```json
{
  "roomNumber": "1101",
  "checkInDate": "2026-06-25",
  "checkOutDate": "2026-06-28",
  "guestName": "Mr. Somchai Jaidee",
  "guestTag": "VIP",
  "tourGroup": {
    "groupId": "TG-2026-001",
    "groupName": "Amazing Thailand Tour 2026",
    "isMember": true
  },
  "language": "th",
  "specialOccasion": "Honeymoon",
  "deviceId": "BOX-101-A"
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `roomNumber` | `string` | **Yes** | หมายเลขห้องพัก เช่น `"101"`, `"1101"` |
| `checkInDate` | `string` | **Yes** | วันที่ Check-in รูปแบบ `YYYY-MM-DD` |
| `checkOutDate` | `string` | **Yes** | วันที่ Check-out รูปแบบ `YYYY-MM-DD` |
| `guestName` | `string` | **Yes** | ชื่อผู้เข้าพัก เช่น `"Mr. John Doe"` |
| `guestTag` | `string` | No | ประเภทแขก (ดูค่าที่รองรับด้านล่าง) |
| `tourGroup` | `object` | No | ข้อมูลกลุ่มทัวร์ (กรอกเฉพาะเมื่อเป็นลูกค้าทัวร์กลุ่ม) |
| `tourGroup.groupId` | `string` | No | รหัสกลุ่มทัวร์ |
| `tourGroup.groupName` | `string` | No | ชื่อกลุ่มทัวร์ที่จะแสดงบนทีวี |
| `tourGroup.isMember` | `boolean` | No | `true` = แสดงเมนูเฉพาะกลุ่มทัวร์ |
| `language` | `string` | No | รหัสภาษา (ดูค่าที่รองรับด้านล่าง) ค่า default: `"en"` |
| `specialOccasion` | `string` | No | โอกาสพิเศษ (ดูค่าที่รองรับด้านล่าง) |
| `deviceId` | `string` | No | Device ID ของ Android TV Box (ถ้าไม่ส่ง ระบบค้นหาจาก `roomNumber` อัตโนมัติ) |

---

#### guestTag — ค่าที่รองรับ

| Value | ความหมาย | สิ่งที่ TV จะแสดง |
|-------|----------|-------------------|
| `"VIP"` | แขก VIP | ป้าย VIP, ข้อความต้อนรับพิเศษ, ธีมทอง |
| `"VVIP"` | แขก VVIP | ป้าย VVIP, ธีมพิเศษสุด |
| `"Member"` | สมาชิก | ป้ายสมาชิก, คะแนนสะสม |
| `"Regular"` | แขกทั่วไป | ไม่มีป้ายพิเศษ |
| `null` | ไม่ระบุ | ไม่มีป้ายพิเศษ |

---

#### language — ภาษาที่รองรับ

| Value | ภาษา |
|-------|------|
| `"th"` | ภาษาไทย |
| `"en"` | English (Default) |
| `"zh"` | 中文 (จีน) |
| `"ja"` | 日本語 (ญี่ปุ่น) |
| `"ko"` | 한국어 (เกาหลี) |
| `"ru"` | Русский (รัสเซีย) |

---

#### specialOccasion — โอกาสพิเศษที่รองรับ

| Value | ความหมาย | สิ่งที่ TV จะแสดง |
|-------|----------|-------------------|
| `"Honeymoon"` | ฮันนีมูน | ธีมหัวใจ, ข้อความโรแมนติก |
| `"Birthday"` | วันเกิด | ข้อความอวยพรวันเกิด, แอนิเมชั่นพิเศษ |
| `"Anniversary"` | วันครบรอบ | ข้อความพิเศษ |
| `"BabyMoon"` | เบบี้มูน | ธีมอ่อนหวาน |
| `null` | ไม่มีโอกาสพิเศษ | แสดงหน้าต้อนรับทั่วไป |

---

#### ตัวอย่าง Request ทุกประเภท

**แขก VIP:**
```json
{
  "roomNumber": "501",
  "checkInDate": "2026-06-25",
  "checkOutDate": "2026-06-27",
  "guestName": "Mr. James Wilson",
  "guestTag": "VIP",
  "language": "en",
  "specialOccasion": null
}
```

**แขกฮันนีมูน:**
```json
{
  "roomNumber": "802",
  "checkInDate": "2026-06-25",
  "checkOutDate": "2026-06-30",
  "guestName": "Mr. & Mrs. Tanaka",
  "guestTag": "Regular",
  "language": "ja",
  "specialOccasion": "Honeymoon"
}
```

**กลุ่มทัวร์:**
```json
{
  "roomNumber": "303",
  "checkInDate": "2026-06-25",
  "checkOutDate": "2026-06-26",
  "guestName": "นาย สมชาย ใจดี",
  "guestTag": "Regular",
  "tourGroup": {
    "groupId": "TG-2026-001",
    "groupName": "Amazing Thailand Tour 2026",
    "isMember": true
  },
  "language": "th",
  "specialOccasion": null
}
```

**แขก VIP วันเกิด:**
```json
{
  "roomNumber": "1001",
  "checkInDate": "2026-06-25",
  "checkOutDate": "2026-06-26",
  "guestName": "คุณ วีระ รักสุข",
  "guestTag": "VIP",
  "language": "th",
  "specialOccasion": "Birthday"
}
```

---

#### Response

**Success `200 OK`:**
```json
{
  "status": "success",
  "message": "Check-in processed successfully."
}
```

**Device Offline (ข้อมูลบันทึกแล้ว TV จะ sync เมื่อออนไลน์) `200 OK`:**
```json
{
  "status": "success",
  "message": "Check-in processed successfully.",
  "warning": "TV device for room 101 is currently offline. Guest data saved and will be applied when device reconnects."
}
```

**Bad Request `400`:**
```json
{
  "status": "error",
  "message": "roomNumber and guestName are required."
}
```

---

### 2. Check-out

**`POST /api/v1/pms/checkout`**

ส่งข้อมูล Check-out เมื่อแขกออกจากห้องพัก ระบบจะล้างข้อมูลแขกและรีเซ็ตทีวีกลับสู่หน้า Default

#### Request Body

```json
{
  "roomNumber": "1101",
  "deviceId": "BOX-101-A"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `roomNumber` | `string` | **Yes** | หมายเลขห้องพัก |
| `deviceId` | `string` | No | Device ID (ถ้าไม่ส่ง ระบบค้นหาจาก `roomNumber` อัตโนมัติ) |

#### Response

**Success `200 OK`:**
```json
{
  "status": "success",
  "message": "Checkout processed. Guest apps wiped for device 192.168.1.62."
}
```

**Error — Device IP Not Found `400`:**
```json
{
  "error": "IP address is required for ADB execution"
}
```

**Error — ADB Failed `500`:**
```json
{
  "error": "Failed to complete checkout ADB sequence"
}
```

---

### 3. ตรวจสอบสถานะห้อง (Status Check)

**`GET /api/v1/pms/status/:ip`**

ดึงข้อมูลสถานะปัจจุบันของ TV Box (ใช้สำหรับ TV กู้คืนสถานะเมื่อรีสตาร์ท)

#### ตัวอย่าง Request

```
GET /api/v1/pms/status/192.168.1.62
```

#### Response — มีแขก (Checked In)

```json
{
  "status": "checked_in",
  "roomNumber": "1101",
  "guestName": "Mr. John Doe",
  "guestTag": "VIP",
  "tourGroup": {
    "groupId": "TG-2026-001",
    "groupName": "Amazing Thailand Tour 2026",
    "isMember": true
  },
  "language": "en",
  "specialOccasion": "Honeymoon",
  "checkInDate": "2026-06-25",
  "checkOutDate": "2026-06-28",
  "deviceId": "BOX-101-A"
}
```

#### Response — ไม่มีแขก (Checked Out)

```json
{
  "status": "checked_out",
  "guestName": null,
  "guestTag": null
}
```

---

## WebSocket Events (อ้างอิง)

เมื่อ PMS เรียก API สำเร็จ Server จะส่ง WebSocket event ไปยัง TV อัตโนมัติ *(PMS ไม่ต้องจัดการส่วนนี้)*

| Event | เมื่อไหร่ | Payload |
|-------|----------|---------|
| `guest_update` | Check-in | `{ status, guestName, guestTag, tourGroup, language, specialOccasion, checkInDate, checkOutDate }` |
| `guest_update` | Check-out | `{ status: "checked_out", guestName: null, guestTag: null }` |

---

## Logic การแสดงผลบน TV

### Tour Group Logic
- `tourGroup.isMember = true` → TV แสดงเฉพาะเมนู/บริการของกลุ่มทัวร์นั้น
- `tourGroup` เป็น `null` → TV แสดงเมนูทั้งหมดตามปกติ

### ลำดับความสำคัญของการแสดงผล

```
1. specialOccasion  →  แสดงธีมพิเศษก่อน (Honeymoon, Birthday ฯลฯ)
2. guestTag         →  แสดงป้าย VIP / VVIP / Member
3. tourGroup        →  กรองเมนูตามกลุ่มทัวร์
4. language         →  ปรับภาษา UI ทั้งหมด
```

---

## Error Codes

| HTTP Code | ความหมาย |
|-----------|----------|
| `200` | สำเร็จ |
| `400` | ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง |
| `404` | ไม่พบ Device หรือห้องในระบบ |
| `500` | Server Error (ADB failed, WebSocket error ฯลฯ) |

---

## หมายเหตุสำหรับ PMS Developer

> [!IMPORTANT]
> - ฟิลด์ `roomNumber` ต้องตรงกับที่ลงทะเบียนใน Hotel TV CMS
> - ถ้าไม่ส่ง `deviceId` ระบบจะค้นหา Device จาก `roomNumber` อัตโนมัติ (แนะนำ)
> - วันที่ใช้รูปแบบ **ISO 8601**: `YYYY-MM-DD`

> [!TIP]
> - ส่ง `language` เพื่อให้ทีวีสลับภาษาอัตโนมัติตามสัญชาติของแขก
> - ถ้าห้องเป็น **กลุ่มทัวร์** ให้ส่ง `tourGroup.isMember: true` เสมอ

> [!NOTE]
> - ถ้า TV ออฟไลน์ขณะ Check-in ข้อมูลจะถูกบันทึกไว้ใน Server และ TV จะ sync สถานะทันทีที่ออนไลน์
> - สำหรับ Production ควรเพิ่ม API Key ใน Header: `X-API-Key: <your_key>`

---

## ตัวอย่าง cURL

```bash
# Check-in แขก VIP ฮันนีมูน
curl -X POST http://192.168.1.10:3000/api/v1/pms/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "802",
    "checkInDate": "2026-06-25",
    "checkOutDate": "2026-06-28",
    "guestName": "Mr. & Mrs. Smith",
    "guestTag": "VIP",
    "language": "en",
    "specialOccasion": "Honeymoon"
  }'

# Check-in กลุ่มทัวร์
curl -X POST http://192.168.1.10:3000/api/v1/pms/checkin \
  -H "Content-Type: application/json" \
  -d '{
    "roomNumber": "303",
    "checkInDate": "2026-06-25",
    "checkOutDate": "2026-06-26",
    "guestName": "นาย สมชาย ใจดี",
    "guestTag": "Regular",
    "tourGroup": {
      "groupId": "TG-2026-001",
      "groupName": "Amazing Thailand Tour 2026",
      "isMember": true
    },
    "language": "th"
  }'

# Check-out
curl -X POST http://192.168.1.10:3000/api/v1/pms/checkout \
  -H "Content-Type: application/json" \
  -d '{"roomNumber": "802"}'
```

---

*เอกสารนี้จัดทำขึ้นสำหรับ Hotel TV System v1.0 | อัปเดตล่าสุด: 2026-06-25*
