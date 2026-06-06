-- Hotels & Properties
CREATE TABLE hotels (
    id UUID PRIMARY KEY,
    name VARCHAR(200),
    code VARCHAR(20) UNIQUE,
    timezone VARCHAR(50),
    locale VARCHAR(10),
    settings JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms
CREATE TABLE rooms (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    room_number VARCHAR(20),
    floor INT,
    room_type VARCHAR(50),    -- Standard, Deluxe, Suite, VIP Suite
    building VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE
);

-- Android Boxes
CREATE TABLE devices (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    room_id UUID REFERENCES rooms(id),
    box_serial VARCHAR(100) UNIQUE,
    mac_address VARCHAR(17),
    ip_address INET,
    android_version VARCHAR(20),
    app_version VARCHAR(20),
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMPTZ,
    tv_power_state VARCHAR(20),
    current_app VARCHAR(100),
    current_channel INT,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- TV Channels
CREATE TABLE channels (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    channel_number INT,
    name VARCHAR(100),
    logo_url TEXT,
    category VARCHAR(50),
    stream_url TEXT,
    stream_type VARCHAR(20),
    epg_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    access_level VARCHAR(20) DEFAULT 'all',
    parental_lock BOOLEAN DEFAULT FALSE,
    sort_order INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Streaming Apps
CREATE TABLE streaming_apps (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    name VARCHAR(100),
    package_name VARCHAR(200),
    icon_url TEXT,
    deep_link TEXT,
    auto_logout BOOLEAN DEFAULT TRUE,
    logout_command TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT
);

-- Screen Templates
CREATE TABLE screen_templates (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    name VARCHAR(100),
    screen_type VARCHAR(50),     -- welcome_default, welcome_guest, welcome_vip, home
    template_data JSONB,         -- Layout, elements, styles
    background_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PMS Reservations (Cached)
CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    room_id UUID REFERENCES rooms(id),
    pms_reservation_id VARCHAR(100),
    guest_first_name VARCHAR(100),
    guest_last_name VARCHAR(100),
    guest_loyalty_tier VARCHAR(20),
    guest_loyalty_id VARCHAR(50),
    guest_language VARCHAR(10),
    check_in DATE,
    check_out DATE,
    room_type VARCHAR(50),
    status VARCHAR(20),          -- RESERVED, CHECKED_IN, CHECKED_OUT, NO_SHOW
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage Events (Analytics)
CREATE TABLE usage_events (
    id UUID PRIMARY KEY,
    hotel_id UUID REFERENCES hotels(id),
    room_id UUID REFERENCES rooms(id),
    device_id UUID REFERENCES devices(id),
    reservation_id UUID REFERENCES reservations(id),
    event_type VARCHAR(50),
    value VARCHAR(200),          -- Channel name, App name
    duration_seconds INT,
    guest_type VARCHAR(20),      -- VIP, Standard (NO PII)
    timestamp TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (timestamp);  -- Partition by month for performance

-- Create partition for current and next month (Example)
CREATE TABLE usage_events_y2026m06 PARTITION OF usage_events FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE usage_events_y2026m07 PARTITION OF usage_events FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Device Commands Log
CREATE TABLE device_commands (
    id UUID PRIMARY KEY,
    device_id UUID REFERENCES devices(id),
    command_type VARCHAR(50),
    payload JSONB,
    status VARCHAR(20),          -- PENDING, SENT, ACKNOWLEDGED, FAILED
    sent_at TIMESTAMPTZ,
    ack_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
