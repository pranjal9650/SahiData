from sqlalchemy import Column, Integer, String, Date, DateTime, Float, Text
from database import Base
from datetime import datetime


class FormEntry(Base):
    __tablename__ = "form_entries"

    id            = Column(Integer, primary_key=True, index=True)
    form_type     = Column(String(150))
    username      = Column(String(255))
    selected_date = Column(Date)
    row_status    = Column(String(50))
    circle        = Column(String(200))


class UploadHistory(Base):
    __tablename__ = "upload_history"

    id            = Column(Integer, primary_key=True, index=True)
    file_name     = Column(String(255))
    form_type     = Column(String(150))
    selected_date = Column(String(50))
    total_rows    = Column(Integer)
    valid_rows    = Column(Integer)
    junk_rows     = Column(Integer)
    valid_file    = Column(String(500))
    junk_file     = Column(String(500))
    upload_time   = Column(DateTime, default=datetime.utcnow)


class SiteMonitoring(Base):
    __tablename__ = "site_monitoring"

    id           = Column(Integer, primary_key=True, index=True)
    site_name    = Column(String(255))
    global_id    = Column(String(100))
    circle       = Column(String(150))
    status       = Column(String(50))
    alarm        = Column(String(255))
    since        = Column(String(100))
    end_time     = Column(String(100))
    last_updated = Column(DateTime, default=datetime.utcnow)


class FormTemplate(Base):
    __tablename__ = "form_templates"

    id         = Column(Integer, primary_key=True, index=True)
    form_name  = Column(String(255), unique=True, index=True)
    columns    = Column(Text)
    rules      = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class CachedSite(Base):
    __tablename__ = "cached_sites"

    id                 = Column(Integer, primary_key=True, index=True)
    site_id            = Column(String(100))
    site_name          = Column(String(255))
    circle             = Column(String(150))
    h1                 = Column(String(150))
    h2                 = Column(String(150))
    imei_no            = Column(String(100), index=True)
    battery_v          = Column(String(50))
    signal_dbm         = Column(String(50))
    last_communication = Column(String(100))
    aging              = Column(String(100))
    fetched_at         = Column(DateTime, default=datetime.utcnow)


class CachedAlarm(Base):
    __tablename__ = "cached_alarms"

    id         = Column(Integer, primary_key=True, index=True)
    global_id  = Column(String(100))
    site_name  = Column(String(255))
    circle     = Column(String(150))
    district   = Column(String(150))
    cluster    = Column(String(150))
    alarm_name = Column(String(255))
    start_time = Column(String(30), index=True)
    end_time   = Column(String(30))
    imei       = Column(String(100), index=True)
    volt       = Column(String(50))
    is_active  = Column(Integer, default=0)
    alarm_date = Column(String(12), index=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)