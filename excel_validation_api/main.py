# =====================================================
# FASTAPI — FULLY DYNAMIC VERSION
# =====================================================

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import extract
from concurrent.futures import ThreadPoolExecutor, as_completed
from pydantic import BaseModel as PydanticBaseModel
from typing import List, Dict, Optional
from routes import site_monitoring

import scheduler
import pandas as pd
import os
import uuid
import re
import requests
import json
from datetime import datetime, timedelta
from io import BytesIO
from math import radians, sin, cos, sqrt, atan2

# =====================================================
# DATABASE
# =====================================================

from database import SessionLocal, engine
import models

# =====================================================
# AUTO CREATE TABLES (runs on startup)
# =====================================================

models.Base.metadata.create_all(bind=engine)

# =====================================================
# APP INIT
# =====================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(site_monitoring.router)

from scheduler import start_scheduler

@app.on_event("startup")
def startup_event():
    start_scheduler()
    import threading
    def _populate_cache():
        db = SessionLocal()
        try:
            today = datetime.now()
            dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
            print("[Startup] Populating site cache from external API...")
            cache_sites_to_db(db)
            print("[Startup] Populating alarm cache for last 7 days...")
            cache_alarms_to_db(db, dates)
            print("[Startup] Cache population complete")
        except Exception as e:
            print(f"[Startup] Cache error: {e}")
        finally:
            db.close()
    threading.Thread(target=_populate_cache, daemon=True).start()

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# =====================================================
# REPORT UPLOAD FOLDER — daily files for email reports
# =====================================================

REPORT_DAILY_DIR = "data/daily"
os.makedirs(REPORT_DAILY_DIR, exist_ok=True)

REPORT_FILE_MAP = {
    "employee":     "employee.xlsx",
    "attendance":   "attendance.xlsx",
    "distance":     "distance.xlsx",
    "forms":        "forms.xlsx",
    "managers":     "managers.xlsx",
    "forms_filled": "forms_filled.xlsx",
    "alarm":        "alarm.csv",
    "active_sites": "active_sites.xlsx",
    "site_master":  "site_master.xlsx",
}

# =====================================================
# DB SESSION
# =====================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =====================================================
# DATA CLEANER
# =====================================================

def safe_clean_df(df):
    df = df.copy()

    df.columns = (
        df.columns
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace("\n", " ", regex=False)
        .str.replace("\r", "", regex=False)
        .str.replace("_", " ", regex=False)
        .str.replace("-", " ", regex=False)
    )

    df.columns = df.columns.str.replace(r"\s+", " ", regex=True)

    df = df.fillna("")

    for col in df.columns:
        df[col] = df[col].map(lambda x: str(x).strip() if pd.notna(x) else "")

    return df

# =====================================================
# DYNAMIC VALIDATION ENGINE
# =====================================================

def apply_dynamic_validation(df, rules):
    valid_rows   = []
    invalid_rows = []

    for _, row in df.iterrows():
        is_valid = True

        for col, rule in rules.items():

            # Normalize column name to match safe_clean_df output
            normalized_col = (
                col.strip().lower()
                .replace("\n", " ").replace("\r", "")
                .replace("_", " ").replace("-", " ")
            )
            normalized_col = re.sub(r"\s+", " ", normalized_col)

            value = str(row.get(normalized_col, "")).strip()

            # ── REQUIRED CHECK ──────────────────────────────
            if rule.get("required") and not value:
                is_valid = False

            # ── UUID ────────────────────────────────────────
            if rule.get("type") == "uuid":
                if value:
                    try:
                        import uuid as _uuid
                        _uuid.UUID(value)
                    except (ValueError, AttributeError):
                        is_valid = False

            # ── SYSTEM ID ────────────────────────────────────
            if rule.get("type") == "system_id":
                if value:
                    prefixes = [p.strip() for p in rule.get("allowed_prefixes", "").split(",") if p.strip()]
                    if prefixes:
                        if not any(value.upper().startswith(p.upper()) for p in prefixes):
                            is_valid = False
                    else:
                        # Generic system ID: must have at least one hyphen and end with alphanumeric
                        if not re.match(r'^[A-Za-z0-9]{1,10}(-[A-Za-z0-9]{1,10}){1,}$', value):
                            is_valid = False

            # ── USERNAME ─────────────────────────────────────
            # username: alphanumeric, dots, underscores, hyphens; no spaces; 3-50 chars
            if rule.get("type") == "username":
                if value:
                    if not re.match(r'^[A-Za-z0-9._\-]{3,50}$', value):
                        is_valid = False

            # ── PHONE ────────────────────────────────────────
            if rule.get("type") == "phone":
                if value:
                    digits = re.sub(r'\D', '', value)
                    fmt = rule.get("phone_format", "any")
                    if fmt == "india_10":
                        if len(digits) != 10 or digits[0] not in "6789":
                            is_valid = False
                    elif fmt == "india_with_code":
                        if not (len(digits) == 12 and digits.startswith("91") and digits[2] in "6789"):
                            is_valid = False
                    elif fmt == "international":
                        if not (7 <= len(digits) <= 15):
                            is_valid = False
                    else:  # "any"
                        if len(digits) < 7:
                            is_valid = False

            # ── PINCODE ──────────────────────────────────────
            if rule.get("type") == "pincode":
                if value:
                    digits = re.sub(r'\D', '', value)
                    fmt = rule.get("pincode_format", "any_numeric")
                    if fmt == "india_6":
                        if len(digits) != 6:
                            is_valid = False
                    elif fmt == "us_zip":
                        if len(digits) not in (5, 9):
                            is_valid = False
                    else:  # any_numeric
                        if not value.replace("-", "").isdigit() or len(digits) < 3:
                            is_valid = False

            # ── TEXT / (other non-validated types) ──────────
            # No special validation — just required check applies

            # ── NUMBER ──────────────────────────────────────
            if rule.get("type") == "number":
                if value and not value.replace(".", "", 1).lstrip("-").isdigit():
                    is_valid = False
                if value:
                    try:
                        n  = float(value)
                        mn = rule.get("min")
                        mx = rule.get("max")
                        if mn != "" and mn is not None and n < float(mn):
                            is_valid = False
                        if mx != "" and mx is not None and n > float(mx):
                            is_valid = False
                    except ValueError:
                        is_valid = False

            # ── METER READING ────────────────────────────────
            if rule.get("type") == "meter_reading":
                if value:
                    if not value.isdigit():
                        is_valid = False
                    else:
                        try:
                            n  = int(value)
                            mn = rule.get("min")
                            mx = rule.get("max")
                            if mn != "" and mn is not None and n < int(mn):
                                is_valid = False
                            if mx != "" and mx is not None and n > int(mx):
                                is_valid = False
                        except ValueError:
                            is_valid = False

            # ── CONSUMPTION ──────────────────────────────────
            if rule.get("type") == "consumption":
                if value and not value.replace(".", "", 1).lstrip("-").isdigit():
                    is_valid = False

            # ── INR RATE ─────────────────────────────────────
            if rule.get("type") == "inr_rate":
                if value:
                    cleaned = value.replace("₹", "").replace(",", "").strip()
                    try:
                        float(cleaned)
                    except ValueError:
                        is_valid = False

            # ── INR AMOUNT ───────────────────────────────────
            if rule.get("type") == "inr_amount":
                if value:
                    cleaned = value.replace("₹", "").replace(",", "").strip()
                    try:
                        amt = float(cleaned)
                        mn  = rule.get("min")
                        mx  = rule.get("max")
                        if mn != "" and mn is not None and amt < float(mn):
                            is_valid = False
                        if mx != "" and mx is not None and amt > float(mx):
                            is_valid = False
                    except ValueError:
                        is_valid = False

            # ── DATETIME ─────────────────────────────────────
            if rule.get("type") == "datetime":
                if value:
                    parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
                    if pd.isna(parsed):
                        is_valid = False

            # ── DATE ─────────────────────────────────────────
            if rule.get("type") == "date":
                if value:
                    parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
                    if pd.isna(parsed):
                        is_valid = False

            # ── APPROVAL FLAG ────────────────────────────────
            if rule.get("type") == "approval_flag":
                if value:
                    true_vals  = [v.strip().lower() for v in rule.get("true_values",  "").split(",") if v.strip()]
                    false_vals = [v.strip().lower() for v in rule.get("false_values", "").split(",") if v.strip()]
                    all_vals   = true_vals + false_vals
                    if all_vals and value.lower() not in all_vals:
                        is_valid = False

            # ── DROPDOWN ─────────────────────────────────────
            if rule.get("type") == "dropdown":
                options_raw = rule.get("options", "")
                if options_raw and value:
                    options = [o.strip().lower() for o in options_raw.split(",")]
                    if value.lower() not in options:
                        is_valid = False

            # ── EMAIL ────────────────────────────────────────
            if rule.get("type") == "email":
                if value:
                    # Check basic email format: local@domain.tld
                    if not re.match(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$', value):
                        is_valid = False
                    else:
                        domains = [d.strip().lower() for d in rule.get("allowed_domains", "").split(",") if d.strip()]
                        if domains:
                            domain_part = value.split("@", 1)[1].lower()
                            if domain_part not in domains:
                                is_valid = False

            # ── LAT/LONG JSON ────────────────────────────────
            if rule.get("type") == "latlong_json":
                if value:
                    try:
                        geo    = json.loads(value)
                        coords = geo.get("coordinates")
                        if not isinstance(coords, list) or len(coords) != 2:
                            is_valid = False
                        else:
                            float(coords[0])
                            float(coords[1])
                    except Exception:
                        is_valid = False

            # ── LAT/LONG TEXT ────────────────────────────────
            if rule.get("type") == "latlong_text":
                if value:
                    parts = re.split(r"[,\s]+", value.strip())
                    try:
                        if len(parts) != 2:
                            is_valid = False
                        else:
                            float(parts[0])
                            float(parts[1])
                    except Exception:
                        is_valid = False

            # ── LATITUDE ─────────────────────────────────────
            if rule.get("type") == "latitude":
                if value:
                    try:
                        v = float(value)
                        if not (-90 <= v <= 90):
                            is_valid = False
                    except ValueError:
                        is_valid = False

            # ── LONGITUDE ────────────────────────────────────
            if rule.get("type") == "longitude":
                if value:
                    try:
                        v = float(value)
                        if not (-180 <= v <= 180):
                            is_valid = False
                    except ValueError:
                        is_valid = False

            # ── LENGTH CHECK ─────────────────────────────────
            if "length" in rule:
                if value and len(value) != rule["length"]:
                    is_valid = False

        if is_valid:
            valid_rows.append(row)
        else:
            invalid_rows.append(row)

    return pd.DataFrame(valid_rows), pd.DataFrame(invalid_rows)

# =====================================================
# USERNAME EXTRACTION — fully dynamic
# Tries common username column names in order
# =====================================================

def extract_username(row):
    possible_cols = ["createduser", "created user", "user name", "username", "operator"]
    for col in possible_cols:
        if col in row:
            value = row[col]
            if isinstance(value, str):
                value = value.strip()
            if value:
                return value
    return "UNKNOWN_USER"

# =====================================================
# VALIDATE FORM API — 100% dynamic, no hardcoding
# =====================================================

@app.post("/VALIDATE-FORM")
async def validate_form(
    file:      UploadFile = File(...),
    form_type: str        = Form(...),
    date:      str        = Form(...),
    db:        Session    = Depends(get_db)
):
    form_type     = form_type.strip()
    selected_date = pd.to_datetime(date, errors="coerce").date()

    if not file.filename:
        raise HTTPException(400, "No file uploaded")

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(400, "Invalid file format. Use CSV or Excel.")

    # ── READ FILE ──────────────────────────────────────
    try:
        file_bytes = await file.read()

        if len(file_bytes) == 0:
            raise HTTPException(400, "Empty file")

        file_stream = BytesIO(file_bytes)

        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(file_stream, dtype=str)
        else:
            df = pd.read_excel(file_stream, dtype=str, engine="openpyxl")

        if len(df) == 0:
            raise HTTPException(400, "File has no data rows")

        df = safe_clean_df(df)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"File read error: {str(e)}")

    # ── FETCH RULES FROM DB ────────────────────────────
    try:
        config = db.query(models.FormTemplate).filter(
            models.FormTemplate.form_name == form_type
        ).first()

        if not config:
            raise HTTPException(
                400,
                f"No validation rules found for '{form_type}'. "
                f"Please create this form first from the Create Form page."
            )

        rules_dict        = json.loads(config.rules or "{}")
        valid_df, junk_df = apply_dynamic_validation(df, rules_dict)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Validation failed: {str(e)}")

    valid_df = valid_df.copy()
    junk_df  = junk_df.copy()

    valid_df["status"] = "valid"
    junk_df["status"]  = "invalid"

    combined_df = pd.concat([valid_df, junk_df], ignore_index=True)

    # ── DUPLICATE UPLOAD CHECK ─────────────────────────
    previous_upload = db.query(models.UploadHistory).filter(
        models.UploadHistory.form_type     == form_type,
        models.UploadHistory.selected_date == str(selected_date)
    ).first()

    message = "File uploaded successfully"

    if previous_upload:
        message = "This form was uploaded before. Old data replaced."

        db.query(models.FormEntry).filter(
            models.FormEntry.form_type     == form_type,
            models.FormEntry.selected_date == selected_date
        ).delete()

        db.query(models.UploadHistory).filter(
            models.UploadHistory.form_type     == form_type,
            models.UploadHistory.selected_date == str(selected_date)
        ).delete()

        db.commit()

    # ── SAVE CSV FILES ─────────────────────────────────
    file_id    = str(uuid.uuid4())
    valid_file = os.path.join(UPLOAD_FOLDER, f"{file_id}_valid.csv")
    junk_file  = os.path.join(UPLOAD_FOLDER, f"{file_id}_junk.csv")

    valid_df.to_csv(valid_file, index=False)
    junk_df.to_csv(junk_file,  index=False)

    # ── DB INSERT ──────────────────────────────────────
    try:
        for _, row in combined_df.iterrows():
            db.add(models.FormEntry(
                form_type     = form_type,
                username      = extract_username(row),
                selected_date = selected_date,
                row_status    = row.get("status", "invalid"),
                circle        = str(row.get("circle", "UNKNOWN"))
            ))

        db.add(models.UploadHistory(
            file_name     = file.filename,
            form_type     = form_type,
            selected_date = str(selected_date),
            total_rows    = len(df),
            valid_rows    = len(valid_df),
            junk_rows     = len(junk_df),
            valid_file    = valid_file,
            junk_file     = junk_file
        ))

        db.commit()

        return {
            "status":     "success",
            "message":    message,
            "total_rows": len(df),
            "valid_rows": len(valid_df),
            "junk_rows":  len(junk_df)
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))


# =====================================================
# PYDANTIC MODEL
# =====================================================

class CreateFileRequest(PydanticBaseModel):
    form_name: str
    columns:   List[str]
    rules:     Optional[Dict] = {}


# =====================================================
# SAVE FORM RULES
# =====================================================

@app.post("/SAVE-FORM-RULES")
def save_form_rules(data: CreateFileRequest, db: Session = Depends(get_db)):
    try:
        existing = db.query(models.FormTemplate).filter(
            models.FormTemplate.form_name == data.form_name
        ).first()

        if existing:
            existing.columns = json.dumps(data.columns)
            existing.rules   = json.dumps(data.rules)
        else:
            db.add(models.FormTemplate(
                form_name = data.form_name,
                columns   = json.dumps(data.columns),
                rules     = json.dumps(data.rules),
            ))

        db.commit()
        return {"status": "saved", "form_name": data.form_name}

    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))


# =====================================================
# GET ALL FORM NAMES — only from DB, no hardcoding
# =====================================================

@app.get("/GET-FORM-NAMES")
def get_form_names(db: Session = Depends(get_db)):
    return [r.form_name for r in db.query(models.FormTemplate).all()]


# =====================================================
# GET FORM RULES
# =====================================================

@app.get("/GET-FORM-RULES")
def get_form_rules(form_name: str, db: Session = Depends(get_db)):
    config = db.query(models.FormTemplate).filter(
        models.FormTemplate.form_name == form_name
    ).first()

    if not config:
        raise HTTPException(404, f"No rules found for form '{form_name}'")

    return {
        "form_name": config.form_name,
        "columns":   json.loads(config.columns or "[]"),
        "rules":     json.loads(config.rules    or "{}")
    }


# =====================================================
# GET ALL FORM RULES
# =====================================================

@app.get("/GET-ALL-FORM-RULES")
def get_all_form_rules(db: Session = Depends(get_db)):
    templates = db.query(models.FormTemplate).all()
    return {
        t.form_name: {
            "columns": json.loads(t.columns or "[]"),
            "rules":   json.loads(t.rules    or "{}")
        }
        for t in templates
    }


# =====================================================
# SITE MONITORING
# =====================================================

SITE_API_URL  = "https://cm.shrotitele.com/user_management/api/tpms-tracker/?api_key=MySecretKey@2025"
ALARM_API_URL = "https://cm.shrotitele.com/user_management/alarm-data/"


def fetch_all_sites():
    try:
        return requests.get(SITE_API_URL).json().get("data", [])
    except Exception as e:
        print("Site API Error:", e)
        return []


def fetch_alarm_data(start_date=None, end_date=None, imei=None):
    today = datetime.now().strftime("%Y-%m-%d")
    params = {
        "start_date": start_date or today,
        "end_date":   end_date   or today,
    }
    if imei:
        params["imei"] = imei
    try:
        resp = requests.get(ALARM_API_URL, params=params, timeout=45)
        resp.raise_for_status()
        data = resp.json().get("data", [])
        print(f"✅ Alarm API returned {len(data)} records for {params['start_date']} → {params['end_date']}")
        return data
    except Exception as e:
        print(f"❌ Alarm API Error: {e}")
        return []


# =====================================================
# DB CACHE — row converters
# =====================================================

def _site_row_to_api(row):
    return {
        "site_code":          row.site_id,
        "globel_id":          row.site_id,
        "site_name":          row.site_name,
        "state":              row.circle,
        "state_name":         row.circle,
        "circle":             row.circle,
        "h1":                 row.h1,
        "district":           row.h1,
        "cluster":            row.h1,
        "h2":                 row.h2,
        "gsm_imei_no":        row.imei_no,
        "battery_v":          row.battery_v,
        "battery":            row.battery_v,
        "signal_dbm":         row.signal_dbm,
        "signal":             row.signal_dbm,
        "last_communication": row.last_communication,
        "last_sync":          row.last_communication,
        "aging":              row.aging,
    }


def _alarm_row_to_api(row):
    return {
        "globel_id":     row.global_id,
        "site_name":     row.site_name,
        "state_name":    row.circle,
        "district":      row.district,
        "cluster":       row.cluster,
        "alarm_name":    row.alarm_name,
        "start_time":    row.start_time,
        "end_time":      row.end_time if row.end_time else None,
        "imei":          row.imei,
        "volt":          row.volt,
        "district_name": row.district,
    }


def get_sites(db: Session):
    """Return sites from DB cache if populated, else fall back to live API."""
    rows = db.query(models.CachedSite).all()
    if rows:
        return [_site_row_to_api(r) for r in rows]
    return fetch_all_sites()


def get_alarms(db: Session, start_date: str, end_date: str, imei: str = None):
    """Return alarms from DB cache if all requested dates are present, else fall back to live API."""
    try:
        start_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_obj   = datetime.strptime(end_date,   "%Y-%m-%d").date()
        needed    = set()
        cur = start_obj
        while cur <= end_obj:
            needed.add(cur.strftime("%Y-%m-%d"))
            cur += timedelta(days=1)

        # Check coverage using the full dataset (no IMEI filter) so that dates
        # with zero alarms for a specific IMEI still count as "cached"
        cached_dates = {
            r[0] for r in db.query(models.CachedAlarm.alarm_date)
                             .filter(models.CachedAlarm.alarm_date >= start_date,
                                     models.CachedAlarm.alarm_date <= end_date)
                             .distinct().all()
        }

        if needed.issubset(cached_dates):
            q = db.query(models.CachedAlarm).filter(
                models.CachedAlarm.alarm_date >= start_date,
                models.CachedAlarm.alarm_date <= end_date,
            )
            if imei:
                q = q.filter(models.CachedAlarm.imei == imei)
            return [_alarm_row_to_api(r) for r in q.all()]
    except Exception as e:
        print(f"Cache read error: {e}")
    return fetch_alarm_data(start_date, end_date, imei)


# =====================================================
# DB CACHE — populate / refresh
# =====================================================

def cache_sites_to_db(db: Session):
    """Fetch from external API and replace all rows in cached_sites."""
    sites = fetch_all_sites()
    if not sites:
        return 0
    now = datetime.utcnow()
    db.query(models.CachedSite).delete()
    for s in sites:
        db.add(models.CachedSite(
            site_id            = str(s.get("site_code") or s.get("globel_id") or ""),
            site_name          = str(s.get("site_name") or ""),
            circle             = str(s.get("state") or s.get("state_name") or s.get("circle") or ""),
            h1                 = str(s.get("h1") or s.get("district") or s.get("cluster") or ""),
            h2                 = str(s.get("h2") or ""),
            imei_no            = str(s.get("gsm_imei_no") or ""),
            battery_v          = str(s.get("battery_v") or s.get("battery") or ""),
            signal_dbm         = str(s.get("signal_dbm") or s.get("signal") or ""),
            last_communication = str(s.get("last_communication") or s.get("last_sync") or ""),
            aging              = str(s.get("aging") or ""),
            fetched_at         = now,
        ))
    db.commit()
    print(f"✅ Cached {len(sites)} sites to DB")
    return len(sites)


def cache_alarms_to_db(db: Session, dates: list):
    """Fetch alarms for each date and refresh those date-partitions in cached_alarms."""
    total = 0
    now   = datetime.utcnow()
    for d in dates:
        alarms = fetch_alarm_data(start_date=d, end_date=d)
        db.query(models.CachedAlarm).filter(models.CachedAlarm.alarm_date == d).delete()
        for a in alarms:
            st        = str(a.get("start_time") or "")
            alarm_date = st[:10] if len(st) >= 10 else d
            end_raw   = a.get("end_time")
            db.add(models.CachedAlarm(
                global_id  = str(a.get("globel_id") or ""),
                site_name  = str(a.get("site_name") or ""),
                circle     = str(a.get("state_name") or ""),
                district   = str(a.get("district") or a.get("district_name") or ""),
                cluster    = str(a.get("cluster") or ""),
                alarm_name = str(a.get("alarm_name") or ""),
                start_time = st,
                end_time   = str(end_raw) if end_raw and str(end_raw).strip() not in ("", "None", "null") else "",
                imei       = str(a.get("imei") or ""),
                volt       = str(a.get("volt") or ""),
                is_active  = 1 if is_active_alarm(a) else 0,
                alarm_date = alarm_date,
                fetched_at = now,
            ))
        db.commit()
        total += len(alarms)
        print(f"✅ Cached {len(alarms)} alarms for {d}")
    return total


# Alarm types that count as a site being "down"
CRITICAL_ALARM_KEYWORDS = ["BTLV", "L LVD CUT", "MNSF", "FIBRE CUT", "FIBER CUT", "FIBRE", "FIBER"]

def is_critical_alarm(alarm):
    name = (alarm.get("alarm_name") or "").upper().strip()
    return any(k in name for k in CRITICAL_ALARM_KEYWORDS)


def is_active_alarm(alarm):
    """True when the alarm has no end_time or ended within the last 10 minutes."""
    et = alarm.get("end_time")
    if not et or str(et).strip() in ("", "None", "null"):
        return True
    try:
        end_dt = datetime.strptime(str(et).strip(), "%Y-%m-%d %H:%M:%S")
        return (datetime.now() - end_dt).total_seconds() < 600
    except Exception:
        return False


def build_site_monitoring(start_date=None, end_date=None):
    sites  = fetch_all_sites()
    alarms = fetch_alarm_data(start_date, end_date)

    # Group ALL alarms by IMEI
    alarm_map = {}
    for alarm in alarms:
        imei = str(alarm.get("imei")).strip()
        alarm_map.setdefault(imei, []).append(alarm)

    up_sites   = []
    down_sites = []

    for site in sites:
        imei      = str(site.get("gsm_imei_no")).strip()
        site_name = site.get("site_name")
        global_id = site.get("globel_id")

        critical_alarms = [a for a in alarm_map.get(imei, []) if is_critical_alarm(a)]

        if critical_alarms:
            latest = sorted(critical_alarms, key=lambda x: x.get("start_time", ""), reverse=True)[0]
            down_sites.append({
                "site_name": site_name,
                "global_id": global_id,
                "imei":      imei,
                "status":    "DOWN",
                "alarm":     latest.get("alarm_name"),
                "since":     latest.get("start_time"),
                "end_time":  latest.get("end_time"),
            })
        else:
            up_sites.append({
                "site_name": site_name,
                "global_id": global_id,
                "imei":      imei,
                "status":    "UP",
                "since":     "Running",
            })

    return sites, up_sites, down_sites


def save_site_monitoring_to_db(db: Session, up_sites, down_sites):
    try:
        db.query(models.SiteMonitoring).delete()

        for site in up_sites:
            db.add(models.SiteMonitoring(
                site_name = site.get("site_name"),
                global_id = site.get("global_id"),
                circle    = "UNKNOWN",
                status    = "Active",
                alarm     = None,
                since     = site.get("since"),
                end_time  = None
            ))

        for site in down_sites:
            db.add(models.SiteMonitoring(
                site_name = site.get("site_name"),
                global_id = site.get("global_id"),
                circle    = "UNKNOWN",
                status    = "Outage",
                alarm     = site.get("alarm"),
                since     = site.get("since"),
                end_time  = site.get("end_time")
            ))

        db.commit()
        print("✅ Site monitoring saved to DB")

    except Exception as e:
        db.rollback()
        print("❌ DB Save Error:", str(e))


@app.get("/SITE-MONITORING")
def site_monitoring_api(
    start_date: str = None,
    end_date:   str = None,
    db: Session = Depends(get_db)
):
    today = datetime.now().strftime("%Y-%m-%d")
    sd = start_date or today
    ed = end_date or today
    sites_raw  = get_sites(db)
    alarms_raw = get_alarms(db, sd, ed)

    alarm_map = {}
    for alarm in alarms_raw:
        imei = str(alarm.get("imei")).strip()
        alarm_map.setdefault(imei, []).append(alarm)

    up_sites, down_sites = [], []
    for site in sites_raw:
        imei            = str(site.get("gsm_imei_no")).strip()
        critical_alarms = [a for a in alarm_map.get(imei, []) if is_critical_alarm(a)]
        if critical_alarms:
            latest = sorted(critical_alarms, key=lambda x: x.get("start_time", ""), reverse=True)[0]
            down_sites.append({
                "site_name": site.get("site_name"),
                "global_id": site.get("globel_id"),
                "imei":      imei,
                "status":    "DOWN",
                "alarm":     latest.get("alarm_name"),
                "since":     latest.get("start_time"),
                "end_time":  latest.get("end_time"),
            })
        else:
            up_sites.append({
                "site_name": site.get("site_name"),
                "global_id": site.get("globel_id"),
                "imei":      imei,
                "status":    "UP",
                "since":     "Running",
            })

    save_site_monitoring_to_db(db, up_sites, down_sites)

    total = len(sites_raw)

    def _has(alarm, *keywords):
        name = (alarm.get("alarm_name") or "").upper()
        return any(k in name for k in keywords)

    # KPIs count unique sites that had that alarm type today
    mains_failed = len({
        str(a.get("imei")).strip() for a in alarms_raw
        if _has(a, "MNSF", "MAINS", "MAIN FAIL")
    })
    battery_low = len({
        str(a.get("imei")).strip() for a in alarms_raw
        if _has(a, "BTLV", "BATTERY", "LVD")
    })
    healthy_pct = round(len(up_sites) / total * 100) if total else 0

    return {
        "total_sites":   total,
        "up_sites":      len(up_sites),
        "down_sites":    len(down_sites),
        "total_alarms":  len(alarms_raw),
        "mains_failed":  mains_failed,
        "battery_low":   battery_low,
        "healthy_pct":   healthy_pct,
    }


@app.get("/SITE-ALARMS")
def site_alarms_api(start_date: str = None, end_date: str = None, db: Session = Depends(get_db)):
    today  = datetime.now().strftime("%Y-%m-%d")
    alarms = get_alarms(db, start_date or today, end_date or today)

    result = []
    for alarm in alarms:
        active = is_active_alarm(alarm)
        volt   = alarm.get("volt")
        result.append({
            "imei":       str(alarm.get("imei")).strip(),
            "site_name":  alarm.get("site_name"),
            "global_id":  alarm.get("globel_id"),
            "alarm_name": alarm.get("alarm_name"),
            "start_time": alarm.get("start_time"),
            "end_time":   alarm.get("end_time"),
            "state_name": alarm.get("state_name"),
            "district":   alarm.get("district_name"),
            "volt":       volt if volt else None,
            "is_active":  active,
        })

    result.sort(key=lambda x: x["start_time"] or "", reverse=True)
    result.sort(key=lambda x: not x["is_active"])
    return result


def _alarm_duration_min(alarm):
    st = alarm.get("start_time")
    et = alarm.get("end_time")
    if not st:
        return None
    try:
        start_dt = datetime.strptime(str(st).strip(), "%Y-%m-%d %H:%M:%S")
        if et and str(et).strip() not in ("", "None", "null"):
            end_dt = datetime.strptime(str(et).strip(), "%Y-%m-%d %H:%M:%S")
        else:
            end_dt = datetime.now()
        return max(0, round((end_dt - start_dt).total_seconds() / 60))
    except Exception:
        return None


@app.get("/SITE-DETAIL")
def site_detail(imei: str, days: int = 7, db: Session = Depends(get_db)):
    today     = datetime.now().strftime("%Y-%m-%d")
    start_day = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    alarms    = get_alarms(db, start_day, today, imei=imei)

    if not alarms:
        return {
            "imei": imei, "total_alarms": 0, "active_count": 0,
            "resolved_count": 0, "active_alarms": [], "alarm_history": [],
            "uptime_pct": 100, "total_downtime_hours": 0, "mttr_minutes": 0,
            "alarm_types_count": 0, "longest_outage_min": 0, "shortest_outage_min": 0,
            "downtime_by_reason": [], "daily_trend": [], "voltage_history": [],
        }

    active_alarms   = [a for a in alarms if is_active_alarm(a)]
    resolved_alarms = [a for a in alarms if not is_active_alarm(a)]

    # Per-alarm durations
    durations_min = [d for a in alarms if (d := _alarm_duration_min(a)) is not None]
    total_downtime_sec = sum(d * 60 for d in durations_min)
    resolve_times_min  = [_alarm_duration_min(a) for a in resolved_alarms
                          if _alarm_duration_min(a) is not None and _alarm_duration_min(a) > 0]

    mttr_min = round(sum(resolve_times_min) / len(resolve_times_min)) if resolve_times_min else 0
    total_period_sec = days * 24 * 3600
    uptime_pct = max(0.0, round((1 - total_downtime_sec / total_period_sec) * 100, 1)) if total_period_sec else 100.0

    # Downtime by reason
    reason_hours  = {}
    reason_counts = {}
    for a in alarms:
        name = a.get("alarm_name") or "Unknown"
        dur  = _alarm_duration_min(a) or 0
        reason_hours[name]  = reason_hours.get(name, 0)  + dur / 60
        reason_counts[name] = reason_counts.get(name, 0) + 1

    downtime_by_reason = sorted(
        [{"alarm_name": k, "hours": round(v, 1), "count": reason_counts[k]}
         for k, v in reason_hours.items()],
        key=lambda x: x["hours"], reverse=True,
    )

    # Daily trend (alarm count per day)
    daily_map = {}
    for a in alarms:
        day = (a.get("start_time") or "")[:10]
        if day:
            daily_map[day] = daily_map.get(day, 0) + 1

    daily_trend = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_trend.append({"date": d, "count": daily_map.get(d, 0)})

    # Voltage history (non-zero volt readings, last 200 pts)
    voltage_history = [
        {"time": a.get("start_time"), "volt": round(float(a.get("volt")), 2)}
        for a in alarms
        if a.get("volt") and float(a.get("volt") or 0) > 0
    ]
    voltage_history.sort(key=lambda x: x["time"] or "")
    voltage_history = voltage_history[-200:]

    # Alarm history (sorted newest first)
    alarm_history = []
    for a in sorted(alarms, key=lambda x: x.get("start_time", ""), reverse=True):
        dur = _alarm_duration_min(a)
        alarm_history.append({
            "alarm_name": a.get("alarm_name"),
            "start_time": a.get("start_time"),
            "end_time":   a.get("end_time"),
            "is_active":  is_active_alarm(a),
            "duration_min": dur,
            "volt":       a.get("volt"),
        })

    return {
        "imei":                 imei,
        "total_alarms":         len(alarms),
        "active_count":         len(active_alarms),
        "resolved_count":       len(resolved_alarms),
        "active_alarms": [
            {
                "alarm_name": a.get("alarm_name"),
                "start_time": a.get("start_time"),
                "duration_min": _alarm_duration_min(a),
                "volt": a.get("volt"),
            }
            for a in sorted(active_alarms, key=lambda x: x.get("start_time", ""), reverse=True)
        ],
        "uptime_pct":           uptime_pct,
        "total_downtime_hours": round(total_downtime_sec / 3600, 1),
        "mttr_minutes":         mttr_min,
        "alarm_types_count":    len(reason_hours),
        "longest_outage_min":   max(durations_min) if durations_min else 0,
        "shortest_outage_min":  min(d for d in durations_min if d > 0) if any(d > 0 for d in durations_min) else 0,
        "downtime_by_reason":   downtime_by_reason,
        "daily_trend":          daily_trend,
        "voltage_history":      voltage_history,
        "alarm_history":        alarm_history,
    }


@app.get("/SITE-DOWN")
def site_down(start_date: str = None, end_date: str = None):
    _, _, down = build_site_monitoring(start_date, end_date)
    return down


@app.get("/SITE-UP")
def site_up(start_date: str = None, end_date: str = None):
    _, up, _ = build_site_monitoring(start_date, end_date)
    return up


# =====================================================
# ANALYTICS
# =====================================================

@app.get("/ANALYTICS")
def get_analytics(
    month: Optional[str] = Query(None),
    db:    Session       = Depends(get_db)
):
    query = db.query(models.FormEntry)

    if month:
        try:
            year, month_num = month.split("-")
            query = query.filter(
                extract("year",  models.FormEntry.selected_date) == int(year),
                extract("month", models.FormEntry.selected_date) == int(month_num)
            )
        except:
            pass

    analytics = {}

    for r in query.all():
        username  = str(r.username  or "UNKNOWN_USER").strip()
        form_type = str(r.form_type)
        circle    = str(r.circle    or "UNKNOWN").strip()

        analytics.setdefault(username, {"username": username, "forms": {}})
        analytics[username]["forms"].setdefault(form_type, {
            "valid": 0, "invalid": 0, "total": 0, "circleWise": {}
        })

        fd = analytics[username]["forms"][form_type]

        if str(r.row_status).lower() == "valid":
            fd["valid"] += 1
        else:
            fd["invalid"] += 1

        fd["circleWise"].setdefault(circle, 0)
        fd["circleWise"][circle] += 1

    for username in analytics:
        for form in analytics[username]["forms"]:
            fd = analytics[username]["forms"][form]
            fd["total"] = fd["valid"] + fd["invalid"]

    return list(analytics.values())


@app.get("/ATTENDANCE-STATUS")
def get_attendance_status():
    """Return {username: attendance_value} from the daily attendance file."""
    import pandas as pd
    att_path = os.path.join("data", "daily", "attendance.xlsx")
    if not os.path.exists(att_path):
        return {}
    try:
        df = pd.read_excel(att_path)
        df.columns = df.columns.astype(str).str.strip()
        cols = list(df.columns)

        # Find username column
        uname_col = next(
            (c for c in cols if "username" in c.lower() or c.lower() == "user"),
            cols[0]
        )

        # Find attendance column — by name first, then by value scan
        PA_VALUES = {"p", "a", "present", "absent", "yes", "no"}
        att_col = next(
            (c for c in cols if any(kw in c.lower() for kw in ["attendance", "attn", "status", "present", "absent"])),
            None
        )
        if not att_col:
            best_col, best_score = None, -1
            for c in cols:
                if c == uname_col:
                    continue
                score = int(df[c].dropna().astype(str).str.strip().str.lower().isin(PA_VALUES).sum())
                if score > best_score:
                    best_score, best_col = score, c
            if best_col and best_score > 0:
                att_col = best_col

        if not att_col:
            return {}

        result = {}
        for _, row in df.iterrows():
            uname = str(row.get(uname_col, "")).strip().lower()
            val   = str(row.get(att_col,   "")).strip()
            if uname and uname not in ("nan", "none", ""):
                result[uname] = val
        return result
    except Exception as e:
        print(f"[Attendance Status] Error: {e}")
        return {}


# =====================================================
# FORM DATA FETCH
# =====================================================

@app.get("/FORM-DATA-MULTI")
def get_form_data_multi(forms: str, db: Session = Depends(get_db)):
    try:
        if forms == "ALL":
            results = db.query(models.FormEntry).order_by(models.FormEntry.id.desc()).all()
        else:
            form_list = [f.strip() for f in forms.split(",") if f.strip()]
            results   = db.query(models.FormEntry)\
                          .filter(models.FormEntry.form_type.in_(form_list))\
                          .order_by(models.FormEntry.id.desc()).all()

        return [
            {
                "form_type": r.form_type,
                "username":  r.username,
                "status":    r.row_status,
                "date":      str(r.selected_date)
            }
            for r in results
        ]
    except Exception as e:
        return {"error": str(e)}


# =====================================================
# DASHBOARD DATA
# =====================================================

@app.get("/DASHBOARD-DATA")
def get_dashboard_data(db: Session = Depends(get_db)):
    data = db.query(models.UploadHistory).all()
    return {
        "total_forms": len(data),
        "total_rows":  sum(e.total_rows or 0 for e in data),
        "valid_rows":  sum(e.valid_rows  or 0 for e in data),
        "junk_rows":   sum(e.junk_rows   or 0 for e in data)
    }


# =====================================================
# DOWNLOAD FILE
# =====================================================

@app.get("/DOWNLOAD")
async def download_file(path: str, filename: str = None):
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")

    display_name = filename if filename else os.path.basename(path)

    if not display_name.lower().endswith(".xlsx"):
        display_name += ".xlsx"

    return FileResponse(
        path,
        filename   = display_name,
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


# =====================================================
# UPLOAD HISTORY
# =====================================================

@app.get("/UPLOAD-HISTORY")
def get_upload_history(db: Session = Depends(get_db)):
    history = db.query(models.UploadHistory).order_by(models.UploadHistory.id.desc()).all()

    return [
        {
            "file_name":   h.file_name,
            "form_type":   h.form_type,
            "upload_time": str(h.upload_time),
            "total_rows":  h.total_rows or 0,
            "valid_rows":  h.valid_rows  or 0,
            "junk_rows":   h.junk_rows   or 0,
        }
        for h in history
    ]


# =====================================================
# INVALID RECORDS
# =====================================================

@app.get("/INVALID-RECORDS")
def get_invalid_records(form_name: str, db: Session = Depends(get_db)):
    try:
        # Get the most recent upload for this form
        history = db.query(models.UploadHistory).filter(
            models.UploadHistory.form_type == form_name
        ).order_by(models.UploadHistory.id.desc()).first()

        if not history:
            return []

        junk_file = history.junk_file

        if not junk_file or not os.path.exists(junk_file):
            return []

        # Read the junk CSV
        junk_df = pd.read_csv(junk_file, dtype=str).fillna("")

        if len(junk_df) == 0:
            return []

        # Get the rules for this form to know what each column expects
        config = db.query(models.FormTemplate).filter(
            models.FormTemplate.form_name == form_name
        ).first()

        rules_dict = json.loads(config.rules or "{}") if config else {}

        records = []

        for idx, row in junk_df.iterrows():
            # Skip the status column
            row_data = {k: v for k, v in row.items() if k != "status"}
            errors = []

            for col, rule in rules_dict.items():
                # Normalize column name same way as safe_clean_df
                normalized_col = (
                    col.strip().lower()
                    .replace("\n", " ").replace("\r", "")
                    .replace("_", " ").replace("-", " ")
                )
                normalized_col = re.sub(r"\s+", " ", normalized_col)

                value = str(row.get(normalized_col, "")).strip()

                reason = None

                if rule.get("required") and not value:
                    reason = f"'{col}' is required but empty"

                elif rule.get("type") == "uuid" and value:
                    try:
                        import uuid as _uuid
                        _uuid.UUID(value)
                    except (ValueError, AttributeError):
                        reason = f"'{value}' is not a valid UUID"

                elif rule.get("type") == "username" and value:
                    if not re.match(r"^[A-Za-z0-9._\-]{3,50}$", value):
                        reason = f"'{value}' is not a valid username"

                elif rule.get("type") == "system_id" and value:
                    prefixes = [p.strip() for p in rule.get("allowed_prefixes", "").split(",") if p.strip()]
                    if prefixes:
                        if not any(value.upper().startswith(p.upper()) for p in prefixes):
                            reason = f"'{value}' does not start with allowed prefix: {', '.join(prefixes)}"
                    else:
                        if not re.match(r"^[A-Za-z0-9]{1,10}(-[A-Za-z0-9]{1,10}){1,}$", value):
                            reason = f"'{value}' is not a valid system ID (expected format: ABC-123)"

                elif rule.get("type") == "number" and value:
                    if not value.replace(".", "", 1).lstrip("-").isdigit():
                        reason = f"'{value}' is not a valid number"
                    else:
                        try:
                            n = float(value)
                            mn = rule.get("min")
                            mx = rule.get("max")
                            if mn not in ("", None) and n < float(mn):
                                reason = f"Value {value} is below minimum ({mn})"
                            if mx not in ("", None) and n > float(mx):
                                reason = f"Value {value} exceeds maximum ({mx})"
                        except ValueError:
                            reason = f"'{value}' could not be parsed as a number"

                elif rule.get("type") == "meter_reading" and value:
                    if not value.isdigit():
                        reason = f"'{value}' is not a valid meter reading — expected a whole number"

                elif rule.get("type") in ("datetime", "date") and value:
                    parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
                    if pd.isna(parsed):
                        reason = f"'{value}' is not a valid date/time format"

                elif rule.get("type") == "email" and value:
                    if not re.match(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$", value):
                        reason = f"'{value}' is not a valid email address"
                    else:
                        domains = [d.strip().lower() for d in rule.get("allowed_domains", "").split(",") if d.strip()]
                        if domains and value.split("@", 1)[1].lower() not in domains:
                            reason = f"'{value}' domain not in allowed: {', '.join(domains)}"

                elif rule.get("type") == "phone" and value:
                    digits = re.sub(r"\D", "", value)
                    fmt = rule.get("phone_format", "any")
                    if fmt == "india_10":
                        if len(digits) != 10 or digits[0] not in "6789":
                            reason = f"'{value}' is not a valid 10-digit Indian mobile number"
                    elif fmt == "india_with_code":
                        if not (len(digits) == 12 and digits.startswith("91") and digits[2] in "6789"):
                            reason = f"'{value}' is not a valid Indian number with country code"
                    elif fmt == "international":
                        if not (7 <= len(digits) <= 15):
                            reason = f"'{value}' is not a valid international phone number"
                    else:
                        if len(digits) < 7:
                            reason = f"'{value}' is not a valid phone number"

                elif rule.get("type") == "pincode" and value:
                    digits = re.sub(r"\D", "", value)
                    fmt = rule.get("pincode_format", "any_numeric")
                    if fmt == "india_6":
                        if len(digits) != 6:
                            reason = f"'{value}' is not a valid 6-digit Indian pincode"
                    elif fmt == "us_zip":
                        if len(digits) not in (5, 9):
                            reason = f"'{value}' is not a valid US ZIP code"
                    else:
                        if not value.replace("-", "").isdigit() or len(digits) < 3:
                            reason = f"'{value}' is not a valid pincode"

                elif rule.get("type") in ("consumption", "inr_rate") and value:
                    cleaned = value.replace("₹", "").replace(",", "").strip()
                    try:
                        float(cleaned)
                    except ValueError:
                        reason = f"'{value}' is not a valid numeric value"

                elif rule.get("type") == "inr_amount" and value:
                    cleaned = value.replace("₹", "").replace(",", "").strip()
                    try:
                        amt = float(cleaned)
                        mn = rule.get("min")
                        mx = rule.get("max")
                        if mn not in ("", None) and amt < float(mn):
                            reason = f"Amount {value} below minimum (₹{mn})"
                        if mx not in ("", None) and amt > float(mx):
                            reason = f"Amount {value} exceeds maximum (₹{mx})"
                    except ValueError:
                        reason = f"'{value}' is not a valid amount"

                elif rule.get("type") == "dropdown" and value:
                    options_raw = rule.get("options", "")
                    if options_raw:
                        options = [o.strip().lower() for o in options_raw.split(",")]
                        if value.lower() not in options:
                            reason = f"'{value}' is not in allowed options: {options_raw}"

                elif rule.get("type") == "approval_flag" and value:
                    true_vals  = [v.strip().lower() for v in rule.get("true_values",  "").split(",") if v.strip()]
                    false_vals = [v.strip().lower() for v in rule.get("false_values", "").split(",") if v.strip()]
                    all_vals   = true_vals + false_vals
                    if all_vals and value.lower() not in all_vals:
                        reason = f"'{value}' is not a valid approval value — expected one of: {', '.join(all_vals)}"

                elif rule.get("type") == "latitude" and value:
                    try:
                        v_float = float(value)
                        if not (-90 <= v_float <= 90):
                            reason = f"'{value}' is out of latitude range (-90 to 90)"
                    except ValueError:
                        reason = f"'{value}' is not a valid latitude"

                elif rule.get("type") == "longitude" and value:
                    try:
                        v_float = float(value)
                        if not (-180 <= v_float <= 180):
                            reason = f"'{value}' is out of longitude range (-180 to 180)"
                    except ValueError:
                        reason = f"'{value}' is not a valid longitude"

                elif rule.get("type") == "latlong_json" and value:
                    try:
                        geo = json.loads(value)
                        coords = geo.get("coordinates")
                        if not isinstance(coords, list) or len(coords) != 2:
                            reason = f"Invalid lat/long JSON structure"
                        else:
                            float(coords[0]); float(coords[1])
                    except Exception:
                        reason = f"'{value}' is not valid lat/long JSON"

                elif rule.get("type") == "latlong_text" and value:
                    parts = re.split(r"[,\s]+", value.strip())
                    try:
                        if len(parts) != 2:
                            reason = f"'{value}' must be two coordinates separated by comma/space"
                        else:
                            float(parts[0]); float(parts[1])
                    except Exception:
                        reason = f"'{value}' is not valid lat/long text"

                if not reason and "length" in rule and value:
                    if len(value) != rule["length"]:
                        reason = f"'{value}' must be exactly {rule['length']} characters"

                if reason:
                    errors.append({"field": col, "reason": reason})

            records.append({
                "row": idx + 2,  # +2: 1-based + header row
                "data": row_data,
                "errors": errors
            })

        return records

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================
# INVALID RECORDS BY USER
# =====================================================

def _resolve_junk_path(stored_path):
    """Try multiple strategies to find the junk CSV on disk."""
    if not stored_path:
        return None
    if os.path.exists(stored_path):
        return stored_path
    api_dir = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.join(api_dir, stored_path)
    if os.path.exists(candidate):
        return candidate
    filename = os.path.basename(stored_path)
    candidate = os.path.join(api_dir, "uploads", filename)
    if os.path.exists(candidate):
        return candidate
    return None


@app.get("/INVALID-RECORDS-BY-USER")
def get_invalid_records_by_user(form_name: str, db: Session = Depends(get_db)):
    try:
        # Get most recent upload for this form
        history = db.query(models.UploadHistory).filter(
            models.UploadHistory.form_type == form_name
        ).order_by(models.UploadHistory.id.desc()).first()

        if not history or not history.junk_file:
            return []

        junk_path = _resolve_junk_path(history.junk_file)

        if not junk_path:
            # Junk file deleted — fall back to FormEntry for per-user counts
            entries = db.query(models.FormEntry).filter(
                models.FormEntry.form_type  == form_name,
                models.FormEntry.row_status == "invalid"
            ).all()
            if not entries:
                return []
            user_counts = {}
            for e in entries:
                uname = (e.username or "Unknown User").strip() or "Unknown User"
                user_counts[uname] = user_counts.get(uname, 0) + 1
            return [
                {
                    "username":      uname,
                    "total_invalid": cnt,
                    "field_summary": [{
                        "field":         "Details unavailable",
                        "fail_count":    cnt,
                        "sample_values": [],
                        "reason":        "Raw data file was removed. Re-upload this form to restore field-level details.",
                    }],
                    "sample_errors": [],
                    "raw_samples":   [],
                }
                for uname, cnt in sorted(user_counts.items(), key=lambda x: -x[1])
            ]

        junk_df = pd.read_csv(junk_path, dtype=str).fillna("")

        if len(junk_df) == 0:
            return []

        # Get rules for this form
        config = db.query(models.FormTemplate).filter(
            models.FormTemplate.form_name == form_name
        ).first()
        rules_dict = json.loads(config.rules or "{}") if config else {}

        # Try to find username column in junk_df
        possible_user_cols = [
            "createduser", "created user", "username",
            "user name", "operator", "created by"
        ]
        user_col = None
        for col in possible_user_cols:
            if col in junk_df.columns:
                user_col = col
                break

        # Build a slug→actual_col map for fuzzy column matching
        col_slug_map = {re.sub(r"[\s._\-]+", "", c.lower()): c for c in junk_df.columns}

        # Group invalid rows by user
        user_map = {}

        for idx, row in junk_df.iterrows():
            # Get username
            if user_col:
                username = str(row.get(user_col, "")).strip() or "Unknown User"
            else:
                username = "Unknown User"

            # Always register this row as invalid — it's in the junk file
            user_map.setdefault(username, {
                "username":      username,
                "total_invalid": 0,
                "field_summary": {},
                "sample_errors": [],
                "raw_samples":   [],
            })
            user_map[username]["total_invalid"] += 1

            # Capture a raw sample row (up to 3 per user) as fallback display
            if len(user_map[username]["raw_samples"]) < 3:
                raw = {k: v for k, v in row.items() if k != "status" and v.strip()}
                user_map[username]["raw_samples"].append({
                    "row_number": int(idx) + 2,
                    "data":       dict(list(raw.items())[:12]),
                })

            errors = []

            for col, rule in rules_dict.items():
                normalized_col = (
                    col.strip().lower()
                    .replace("\n", " ").replace("\r", "")
                    .replace("_", " ").replace("-", " ")
                )
                normalized_col = re.sub(r"\s+", " ", normalized_col)

                # Primary lookup; fall back to slug match when column names differ
                value = str(row.get(normalized_col, "")).strip()
                if not value:
                    slug = re.sub(r"[\s._\-]+", "", normalized_col)
                    actual_col = col_slug_map.get(slug, "")
                    if actual_col:
                        value = str(row.get(actual_col, "")).strip()

                reason = None

                if rule.get("required") and not value:
                    reason = "Required field is empty"

                elif rule.get("type") == "uuid" and value:
                    try:
                        import uuid as _uuid
                        _uuid.UUID(value)
                    except (ValueError, AttributeError):
                        reason = f"'{value}' is not a valid UUID"

                elif rule.get("type") == "username" and value:
                    if not re.match(r"^[A-Za-z0-9._\-]{3,50}$", value):
                        reason = f"'{value}' is not a valid username (3–50 alphanumeric/._- chars)"

                elif rule.get("type") == "system_id" and value:
                    prefixes = [p.strip() for p in rule.get("allowed_prefixes", "").split(",") if p.strip()]
                    if prefixes:
                        if not any(value.upper().startswith(p.upper()) for p in prefixes):
                            reason = f"'{value}' does not start with allowed prefix: {', '.join(prefixes)}"
                    else:
                        if not re.match(r"^[A-Za-z0-9]{1,10}(-[A-Za-z0-9]{1,10}){1,}$", value):
                            reason = f"'{value}' is not a valid system ID (expected format: ABC-123)"

                elif rule.get("type") == "number" and value:
                    if not value.replace(".", "", 1).lstrip("-").isdigit():
                        reason = f"'{value}' is not a valid number"
                    else:
                        try:
                            n = float(value)
                            mn, mx = rule.get("min"), rule.get("max")
                            if mn not in ("", None) and n < float(mn):
                                reason = f"Value {value} is below minimum ({mn})"
                            if mx not in ("", None) and n > float(mx):
                                reason = f"Value {value} exceeds maximum ({mx})"
                        except ValueError:
                            reason = f"'{value}' could not be parsed as number"

                elif rule.get("type") == "meter_reading" and value:
                    if not value.isdigit():
                        reason = f"'{value}' is not a valid meter reading"
                    else:
                        try:
                            n = int(value)
                            mn, mx = rule.get("min"), rule.get("max")
                            if mn not in ("", None) and n < int(mn):
                                reason = f"Value {value} is below minimum ({mn})"
                            if mx not in ("", None) and n > int(mx):
                                reason = f"Value {value} exceeds maximum ({mx})"
                        except ValueError:
                            pass

                elif rule.get("type") in ("datetime", "date") and value:
                    parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
                    if pd.isna(parsed):
                        reason = f"'{value}' is not a valid date format"

                elif rule.get("type") == "email" and value:
                    if not re.match(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$", value):
                        reason = f"'{value}' is not a valid email"
                    else:
                        domains = [d.strip().lower() for d in rule.get("allowed_domains", "").split(",") if d.strip()]
                        if domains and value.split("@", 1)[1].lower() not in domains:
                            reason = f"'{value}' domain not in allowed: {', '.join(domains)}"

                elif rule.get("type") == "phone" and value:
                    digits = re.sub(r"\D", "", value)
                    fmt = rule.get("phone_format", "any")
                    if fmt == "india_10":
                        if len(digits) != 10 or digits[0] not in "6789":
                            reason = f"'{value}' is not a valid 10-digit Indian mobile number"
                    elif fmt == "india_with_code":
                        if not (len(digits) == 12 and digits.startswith("91") and digits[2] in "6789"):
                            reason = f"'{value}' is not a valid Indian number with country code"
                    elif fmt == "international":
                        if not (7 <= len(digits) <= 15):
                            reason = f"'{value}' is not a valid international phone number"
                    else:
                        if len(digits) < 7:
                            reason = f"'{value}' is not a valid phone number"

                elif rule.get("type") == "pincode" and value:
                    digits = re.sub(r"\D", "", value)
                    fmt = rule.get("pincode_format", "any_numeric")
                    if fmt == "india_6":
                        if len(digits) != 6:
                            reason = f"'{value}' is not a valid 6-digit Indian pincode"
                    elif fmt == "us_zip":
                        if len(digits) not in (5, 9):
                            reason = f"'{value}' is not a valid US ZIP code"
                    else:
                        if not value.replace("-", "").isdigit() or len(digits) < 3:
                            reason = f"'{value}' is not a valid pincode"

                elif rule.get("type") in ("consumption", "inr_rate") and value:
                    cleaned = value.replace("₹", "").replace(",", "").strip()
                    try:
                        float(cleaned)
                    except ValueError:
                        reason = f"'{value}' is not a valid numeric value"

                elif rule.get("type") == "inr_amount" and value:
                    cleaned = value.replace("₹", "").replace(",", "").strip()
                    try:
                        amt = float(cleaned)
                        mn, mx = rule.get("min"), rule.get("max")
                        if mn not in ("", None) and amt < float(mn):
                            reason = f"Amount {value} below minimum (₹{mn})"
                        if mx not in ("", None) and amt > float(mx):
                            reason = f"Amount {value} exceeds maximum (₹{mx})"
                    except ValueError:
                        reason = f"'{value}' is not a valid amount"

                elif rule.get("type") == "dropdown" and value:
                    options_raw = rule.get("options", "")
                    if options_raw:
                        options = [o.strip().lower() for o in options_raw.split(",")]
                        if value.lower() not in options:
                            reason = f"'{value}' not in allowed options: {options_raw}"

                elif rule.get("type") == "approval_flag" and value:
                    true_vals  = [v.strip().lower() for v in rule.get("true_values",  "").split(",") if v.strip()]
                    false_vals = [v.strip().lower() for v in rule.get("false_values", "").split(",") if v.strip()]
                    all_vals   = true_vals + false_vals
                    if all_vals and value.lower() not in all_vals:
                        reason = f"'{value}' not valid — expected: {', '.join(all_vals)}"

                elif rule.get("type") == "latitude" and value:
                    try:
                        v_float = float(value)
                        if not (-90 <= v_float <= 90):
                            reason = f"'{value}' out of latitude range"
                    except ValueError:
                        reason = f"'{value}' is not a valid latitude"

                elif rule.get("type") == "longitude" and value:
                    try:
                        v_float = float(value)
                        if not (-180 <= v_float <= 180):
                            reason = f"'{value}' out of longitude range"
                    except ValueError:
                        reason = f"'{value}' is not a valid longitude"

                elif rule.get("type") == "latlong_json" and value:
                    try:
                        geo = json.loads(value)
                        coords = geo.get("coordinates")
                        if not isinstance(coords, list) or len(coords) != 2:
                            reason = f"Invalid lat/long JSON structure"
                        else:
                            float(coords[0]); float(coords[1])
                    except Exception:
                        reason = f"'{value}' is not valid lat/long JSON"

                elif rule.get("type") == "latlong_text" and value:
                    parts = re.split(r"[,\s]+", value.strip())
                    try:
                        if len(parts) != 2:
                            reason = f"'{value}' must be two coordinates separated by comma/space"
                        else:
                            float(parts[0]); float(parts[1])
                    except Exception:
                        reason = f"'{value}' is not valid lat/long text"

                if not reason and "length" in rule and value:
                    if len(value) != rule["length"]:
                        reason = f"'{value}' must be exactly {rule['length']} characters"

                if reason:
                    errors.append({
                        "field":  col,
                        "value":  value,
                        "reason": reason
                    })

            if errors:
                # Field-level summary — count how many times each field failed
                for err in errors:
                    field = err["field"]
                    user_map[username]["field_summary"].setdefault(
                        field, {"count": 0, "sample_values": []}
                    )
                    user_map[username]["field_summary"][field]["count"] += 1
                    samples = user_map[username]["field_summary"][field]["sample_values"]
                    if len(samples) < 5 and err["value"] not in samples:
                        samples.append(err["value"])

                # Keep max 3 full sample error rows per user for preview
                if len(user_map[username]["sample_errors"]) < 3:
                    user_map[username]["sample_errors"].append({
                        "row_number": int(idx) + 2,
                        "errors":     errors
                    })

        # Convert field_summary dict to sorted list
        result = []
        for username, data in user_map.items():
            field_summary_list = sorted(
                [
                    {
                        "field":         field,
                        "fail_count":    info["count"],
                        "sample_values": info["sample_values"],
                        "reason":        f"Failed {info['count']} time(s)"
                    }
                    for field, info in data["field_summary"].items()
                ],
                key=lambda x: x["fail_count"],
                reverse=True
            )

            # Fallback: if no specific field errors found, show raw row data summary
            if not field_summary_list:
                field_summary_list = [{
                    "field":         "Validation failed",
                    "fail_count":    data["total_invalid"],
                    "sample_values": [],
                    "reason":        "Records did not pass validation — specific field details below",
                }]

            result.append({
                "username":      username,
                "total_invalid": data["total_invalid"],
                "field_summary": field_summary_list,
                "sample_errors": data["sample_errors"],
                "raw_samples":   data.get("raw_samples", []),
            })

        # Sort by most invalid entries first
        result.sort(key=lambda x: x["total_invalid"], reverse=True)
        return result

    except Exception as e:
        raise HTTPException(500, f"Failed to fetch user invalid records: {str(e)}")


# =====================================================
# REVALIDATE FORM — re-runs validation on stored records
# using the current rules (called after a rule change)
# =====================================================

@app.post("/REVALIDATE-FORM")
def revalidate_form(body: dict, db: Session = Depends(get_db)):
    form_name = (body.get("form_name") or "").strip()

    if not form_name:
        raise HTTPException(400, "form_name is required")

    # 1. Load current rules
    config = db.query(models.FormTemplate).filter(
        models.FormTemplate.form_name == form_name
    ).first()

    if not config:
        raise HTTPException(404, f"No form template found for '{form_name}'")

    rules_dict = json.loads(config.rules or "{}")

    # 2. Find all upload history records for this form
    uploads = db.query(models.UploadHistory).filter(
        models.UploadHistory.form_type == form_name
    ).all()

    if not uploads:
        return {"status": "ok", "message": "No uploaded records to revalidate", "updated": 0}

    total_revalidated = 0

    for upload in uploads:
        valid_path = upload.valid_file
        junk_path  = upload.junk_file

        # Skip if CSV files are missing
        if not valid_path or not junk_path:
            continue
        if not os.path.exists(valid_path) or not os.path.exists(junk_path):
            continue

        # 3. Reconstruct the original data by combining valid + junk CSVs
        valid_df = pd.read_csv(valid_path, dtype=str).fillna("")
        junk_df  = pd.read_csv(junk_path,  dtype=str).fillna("")

        # Drop the status column added during validation
        for df in (valid_df, junk_df):
            if "status" in df.columns:
                df.drop(columns=["status"], inplace=True)

        combined_df = pd.concat([valid_df, junk_df], ignore_index=True)

        if len(combined_df) == 0:
            continue

        # 4. Re-run validation with current rules
        new_valid_df, new_junk_df = apply_dynamic_validation(combined_df, rules_dict)

        new_valid_df = new_valid_df.copy()
        new_junk_df  = new_junk_df.copy()

        new_valid_df["status"] = "valid"
        new_junk_df["status"]  = "invalid"

        # 5. Overwrite the CSV files
        new_valid_df.to_csv(valid_path, index=False)
        new_junk_df.to_csv(junk_path,   index=False)

        # 6. Update UploadHistory counts
        upload.valid_rows = len(new_valid_df)
        upload.junk_rows  = len(new_junk_df)

        # 7. Re-build FormEntry rows for this upload's date
        selected_date = upload.selected_date
        db.query(models.FormEntry).filter(
            models.FormEntry.form_type     == form_name,
            models.FormEntry.selected_date == selected_date
        ).delete()

        new_combined = pd.concat([new_valid_df, new_junk_df], ignore_index=True)
        for _, row in new_combined.iterrows():
            db.add(models.FormEntry(
                form_type     = form_name,
                username      = extract_username(row),
                selected_date = selected_date,
                row_status    = row.get("status", "invalid"),
                circle        = str(row.get("circle", "UNKNOWN"))
            ))

        total_revalidated += len(new_combined)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"DB commit failed: {str(e)}")

    return {
        "status":      "ok",
        "form_name":   form_name,
        "uploads":     len(uploads),
        "revalidated": total_revalidated
    }


# =====================================================
# VALID RECORDS BY USER
# =====================================================

@app.get("/VALID-RECORDS-BY-USER")
def get_valid_records_by_user(form_name: str, db: Session = Depends(get_db)):
    try:
        history = db.query(models.UploadHistory).filter(
            models.UploadHistory.form_type == form_name
        ).order_by(models.UploadHistory.id.desc()).first()

        if not history or not history.valid_file:
            return []

        # Robust path resolution
        valid_path = None
        for candidate in [
            history.valid_file,
            os.path.join(os.path.dirname(os.path.abspath(__file__)), history.valid_file),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads", os.path.basename(history.valid_file)),
        ]:
            if candidate and os.path.exists(candidate):
                valid_path = candidate
                break

        if not valid_path:
            # Fall back to FormEntry counts only
            entries = db.query(models.FormEntry).filter(
                models.FormEntry.form_type  == form_name,
                models.FormEntry.row_status == "valid"
            ).all()
            if not entries:
                return []
            user_counts = {}
            for e in entries:
                uname = (e.username or "Unknown User").strip() or "Unknown User"
                user_counts[uname] = user_counts.get(uname, 0) + 1
            return [
                {"username": uname, "total_valid": cnt, "sample_rows": []}
                for uname, cnt in sorted(user_counts.items(), key=lambda x: -x[1])
            ]

        valid_df = pd.read_csv(valid_path, dtype=str).fillna("")

        if len(valid_df) == 0:
            return []

        possible_user_cols = [
            "createduser", "created user", "username",
            "user name", "operator", "created by"
        ]
        user_col = None
        for col in possible_user_cols:
            if col in valid_df.columns:
                user_col = col
                break

        user_map = {}

        for idx, row in valid_df.iterrows():
            username = str(row.get(user_col, "")).strip() or "Unknown User" if user_col else "Unknown User"

            user_map.setdefault(username, {"total_valid": 0, "sample_rows": []})
            user_map[username]["total_valid"] += 1

            if len(user_map[username]["sample_rows"]) < 3:
                row_data = {k: v for k, v in row.items() if k != "status" and str(v).strip()}
                user_map[username]["sample_rows"].append({
                    "row_number": int(idx) + 2,
                    "data":       dict(list(row_data.items())[:12]),
                })

        result = [
            {"username": uname, "total_valid": data["total_valid"], "sample_rows": data["sample_rows"]}
            for uname, data in user_map.items()
        ]
        result.sort(key=lambda x: x["total_valid"], reverse=True)
        return result

    except Exception as e:
        raise HTTPException(500, f"Failed to fetch user valid records: {str(e)}")


@app.get("/USER-FORM-RECORDS")
def get_user_form_records(
    username:  str,
    form_name: str,
    status:    str,          # "valid" or "invalid"
    db: Session = Depends(get_db),
):
    """Return every row for a specific user + form + status from the stored CSV."""
    try:
        history = db.query(models.UploadHistory).filter(
            models.UploadHistory.form_type == form_name
        ).order_by(models.UploadHistory.id.desc()).first()

        if not history:
            return {"total": 0, "columns": [], "rows": []}

        raw_path = history.junk_file if status == "invalid" else history.valid_file
        if not raw_path:
            return {"total": 0, "columns": [], "rows": []}

        # Resolve path robustly
        api_dir   = os.path.dirname(os.path.abspath(__file__))
        file_path = None
        for candidate in [
            raw_path,
            os.path.join(api_dir, raw_path),
            os.path.join(api_dir, "uploads", os.path.basename(raw_path)),
        ]:
            if candidate and os.path.exists(candidate):
                file_path = candidate
                break

        if not file_path:
            return {"total": 0, "columns": [], "rows": []}

        df = pd.read_csv(file_path, dtype=str).fillna("")

        # Find username column
        possible_user_cols = [
            "createduser", "created user", "username",
            "user name", "operator", "created by",
        ]
        user_col = next((c for c in possible_user_cols if c in df.columns), None)

        # Filter rows to this user
        if user_col:
            df = df[df[user_col].str.strip().str.lower() == username.strip().lower()]

        # Drop internal housekeeping columns
        drop = {"status", "row_status", "junk_reason", "_status"}
        df   = df[[c for c in df.columns if c.lower() not in drop]]

        columns = list(df.columns)
        rows = [
            {"row_number": int(idx) + 2, "data": dict(row)}
            for idx, row in df.iterrows()
        ]
        return {"total": len(rows), "columns": columns, "rows": rows}

    except Exception as e:
        raise HTTPException(500, f"Failed to fetch user form records: {str(e)}")


# =====================================================
# SITE DASHBOARD — CSV-based endpoints
# =====================================================

SITE_STATUS_CSV = os.path.join("data", "Site_Status.csv")

def find_alarm_csv():
    """Find the latest Alarm_Report CSV in the data/ folder."""
    matches = sorted(f for f in os.listdir("data") if f.startswith("Alarm_Report") and f.endswith(".csv"))
    if not matches:
        raise HTTPException(404, "Alarm_Report CSV not found in data/ folder")
    return os.path.join("data", matches[-1])


def load_site_status():
    df = pd.read_csv(SITE_STATUS_CSV, dtype=str).fillna("")
    df.columns = df.columns.str.strip()
    return df


def load_alarm_report():
    path = find_alarm_csv()
    df = pd.read_csv(path, dtype=str).fillna("")
    df.columns = df.columns.str.strip()
    return df


def filter_alarm_by_days(df: pd.DataFrame, days: int) -> pd.DataFrame:
    """Filter alarm rows to the last `days` days relative to the newest record in the data."""
    dt = pd.to_datetime(df["Alarm Start Time"], errors="coerce")
    max_dt = dt.max()
    if pd.isna(max_dt):
        return df
    cutoff = max_dt - pd.Timedelta(days=days)
    return df[dt >= cutoff].reset_index(drop=True)


def parse_duration_to_minutes(duration_str: str) -> float:
    """Convert HH:MM:SS string to total minutes. Returns 0 on parse failure."""
    try:
        parts = str(duration_str).strip().split(":")
        if len(parts) == 3:
            h, m, s = int(parts[0]), int(parts[1]), float(parts[2])
            return h * 60 + m + s / 60
    except Exception:
        pass
    return 0.0


@app.get("/SITE-DASHBOARD-STATS")
def site_dashboard_stats(date: str = None, db: Session = Depends(get_db)):
    try:
        d = date or datetime.now().strftime("%Y-%m-%d")

        sites  = get_sites(db)
        alarms = get_alarms(db, d, d)

        total_active_sites = len(sites)
        total_alarm_events = len(alarms)
        unique_alarm_sites = len(set(str(a.get("imei", "")).strip() for a in alarms if a.get("imei")))
        circles_affected   = len(set(str(a.get("state_name", "")).strip() for a in alarms if a.get("state_name")))

        durations = [dur for a in alarms if (dur := _alarm_duration_min(a)) is not None]
        avg_alarm_duration_minutes = round(sum(durations) / len(durations), 2) if durations else 0

        return {
            "total_active_sites":         total_active_sites,
            "total_alarm_events":         total_alarm_events,
            "unique_alarm_sites":         unique_alarm_sites,
            "circles_affected":           circles_affected,
            "avg_alarm_duration_minutes": avg_alarm_duration_minutes,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ABSENT-STATS")
def site_absent_stats():
    """
    Returns absent site count (sites marked as Down/Outage from site monitoring).
    This is separate from the attendance file for field staff.
    """
    try:
        db = SessionLocal()
        down_sites = db.query(models.SiteMonitoring).filter(
            models.SiteMonitoring.status == "Outage"
        ).count()
        total_sites = db.query(models.SiteMonitoring).count()
        return {
            "total_sites":    total_sites,
            "down_sites":     down_sites,
            "active_sites":   total_sites - down_sites
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        db.close()


@app.get("/SITE-DOWN-LIST")
def site_down_list(date: str = None, db: Session = Depends(get_db)):
    """Returns list of sites currently down — based on critical alarms."""
    try:
        d      = date or datetime.now().strftime("%Y-%m-%d")
        alarms = get_alarms(db, d, d)

        seen = {}
        for a in alarms:
            if not is_critical_alarm(a):
                continue
            imei = str(a.get("imei", "")).strip()
            if imei and imei not in seen:
                seen[imei] = {
                    "site_name": a.get("site_name"),
                    "global_id": a.get("globel_id"),
                    "circle":    a.get("state_name"),
                    "alarm":     a.get("alarm_name"),
                    "since":     a.get("start_time"),
                }
        return list(seen.values())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ACTIVE-LIST")
def site_active_list(db: Session = Depends(get_db)):
    try:
        sites = get_sites(db)
        result = []
        for s in sites:
            result.append({
                "site_id":            s.get("site_code") or s.get("globel_id") or "—",
                "site_name":          s.get("site_name") or "—",
                "circle":             s.get("state") or s.get("state_name") or s.get("circle") or "—",
                "h1":                 s.get("h1") or s.get("district") or s.get("cluster") or "—",
                "h2":                 s.get("h2") or "—",
                "imei_no":            s.get("gsm_imei_no") or "—",
                "battery_v":          s.get("battery_v") or s.get("battery") or "—",
                "signal_dbm":         s.get("signal_dbm") or s.get("signal") or "—",
                "last_communication": s.get("last_communication") or s.get("last_sync") or "—",
                "aging":              s.get("aging") or "—",
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ALARM-LIST")
def site_alarm_list(date: str = None, db: Session = Depends(get_db)):
    try:
        d      = date or datetime.now().strftime("%Y-%m-%d")
        alarms = get_alarms(db, d, d)

        result = []
        for a in alarms:
            dur_min = _alarm_duration_min(a)
            if dur_min is not None:
                h, m = divmod(int(dur_min), 60)
                dur_str = f"{h:02d}:{m:02d}:00"
            else:
                dur_str = "—"
            result.append({
                "global_id":        a.get("globel_id") or "—",
                "site_name":        a.get("site_name") or "—",
                "circle":           a.get("state_name") or "—",
                "district":         a.get("district") or "—",
                "cluster":          a.get("cluster") or "—",
                "alarm_type":       a.get("alarm_name") or "—",
                "alarm_start_time": a.get("start_time") or "—",
                "alarm_end_time":   a.get("end_time") or "—",
                "duration":         dur_str,
                "battery_start_v":  "—",
                "battery_end_v":    a.get("volt") or "—",
                "imei":             a.get("imei") or "—",
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ALARM-TREND")
def site_alarm_trend(date: str = None, db: Session = Depends(get_db)):
    try:
        d      = date or datetime.now().strftime("%Y-%m-%d")
        alarms = get_alarms(db, d, d)

        hourly = {h: 0 for h in range(24)}
        for a in alarms:
            st = a.get("start_time") or ""
            if len(st) >= 13:
                try:
                    hourly[int(st[11:13])] += 1
                except (ValueError, KeyError):
                    pass

        return [{"hour": f"{h:02d}:00", "count": hourly[h]} for h in range(24)]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ALARM-BY-TYPE")
def site_alarm_by_type(date: str = None, db: Session = Depends(get_db)):
    try:
        d      = date or datetime.now().strftime("%Y-%m-%d")
        alarms = get_alarms(db, d, d)

        type_map = {}
        for a in alarms:
            name = (a.get("alarm_name") or "Unknown").strip()
            type_map[name] = type_map.get(name, 0) + 1

        return sorted(
            [{"alarm_type": k, "count": v} for k, v in type_map.items()],
            key=lambda x: x["count"], reverse=True,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ALARM-BY-CIRCLE")
def site_alarm_by_circle(date: str = None, db: Session = Depends(get_db)):
    try:
        d      = date or datetime.now().strftime("%Y-%m-%d")
        alarms = get_alarms(db, d, d)

        circle_map = {}
        for a in alarms:
            circle = (a.get("state_name") or "").strip()
            if circle:
                circle_map[circle] = circle_map.get(circle, 0) + 1

        return sorted(
            [{"circle": k, "count": v} for k, v in circle_map.items()],
            key=lambda x: x["count"], reverse=True,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-ACTIVE-BY-CIRCLE")
def site_active_by_circle(date: str = None, db: Session = Depends(get_db)):
    try:
        # Build IMEI → circle from selected date's alarm data
        d      = date or datetime.now().strftime("%Y-%m-%d")
        sites  = get_sites(db)
        alarms = get_alarms(db, d, d)
        imei_to_circle = {}
        for a in alarms:
            imei   = str(a.get("imei", "")).strip()
            circle = (a.get("state_name") or "").strip()
            if imei and circle and imei not in imei_to_circle:
                imei_to_circle[imei] = circle

        # Count active (non-critical-alarm) sites per circle
        # Sites with a critical alarm today are "down" — skip them
        down_imeis = set()
        for a in alarms:
            if is_critical_alarm(a):
                down_imeis.add(str(a.get("imei", "")).strip())

        circle_map = {}
        for s in sites:
            imei   = str(s.get("gsm_imei_no", "")).strip()
            if imei in down_imeis:
                continue
            circle = imei_to_circle.get(imei) or \
                     s.get("state") or s.get("state_name") or s.get("circle") or "Unknown"
            circle = circle.strip() or "Unknown"
            circle_map[circle] = circle_map.get(circle, 0) + 1

        return sorted(
            [{"circle": k, "count": v} for k, v in circle_map.items()],
            key=lambda x: x["count"], reverse=True,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))



def _fetch_days_parallel(dates: list) -> dict:
    """Fetch alarm data for multiple dates in parallel (live API). Returns {date: [alarms]}."""
    daily = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(fetch_alarm_data, d, d): d for d in dates}
        for f in as_completed(futures):
            d = futures[f]
            try:
                daily[d] = f.result()
            except Exception as e:
                print(f"⚠️  Parallel fetch error for {d}: {e}")
                daily[d] = []
    return daily


def _fetch_days_cached(db: Session, dates: list) -> dict:
    """Fetch alarm data for multiple dates, using DB cache where available."""
    daily    = {}
    api_dates = []
    for d in dates:
        rows = db.query(models.CachedAlarm).filter(models.CachedAlarm.alarm_date == d).all()
        if rows:
            daily[d] = [_alarm_row_to_api(r) for r in rows]
        else:
            api_dates.append(d)
    if api_dates:
        live = _fetch_days_parallel(api_dates)
        daily.update(live)
    return daily


@app.get("/CIRCLE-REPORT")
def circle_report(rng: str = Query("today", alias="range"), db: Session = Depends(get_db)):
    today     = datetime.now().date()
    yesterday = today - timedelta(days=1)

    if rng == "yesterday":
        dates       = [yesterday.strftime("%Y-%m-%d")]
        period_days = 1
    elif rng == "7days":
        dates       = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        period_days = 7
    elif rng == "30days":
        dates       = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(30)]
        period_days = 30
    else:  # today
        dates       = [today.strftime("%Y-%m-%d")]
        period_days = 1

    sites      = get_sites(db)
    daily_data = _fetch_days_cached(db, dates)
    all_alarms = [a for v in daily_data.values() for a in v]

    def _fmt_alarm_time(dt_str):
        if not dt_str or str(dt_str).strip() in ("", "None", "null"):
            return "—"
        try:
            dt = datetime.strptime(str(dt_str).strip(), "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%I:%M %p")
        except Exception:
            return str(dt_str)

    # Build IMEI→circle map (alarm data is most reliable)
    imei_circle: dict = {}
    for s in sites:
        imei   = str(s.get("gsm_imei_no") or "").strip()
        circle = (s.get("state") or s.get("state_name") or s.get("circle") or "").strip()
        if imei and circle:
            imei_circle[imei] = circle
    for a in all_alarms:
        imei   = str(a.get("imei") or "").strip()
        circle = (a.get("state_name") or "").strip()
        if imei and circle:
            imei_circle[imei] = circle

    # Group TPMS sites → circle (for total_sites count)
    circle_imeis: dict = {}
    for s in sites:
        imei   = str(s.get("gsm_imei_no") or "").strip()
        circle = imei_circle.get(imei) or "Unknown"
        circle_imeis.setdefault(circle, set()).add(imei)

    # Group alarms → circle → IMEI
    circle_imei_alarms: dict = {}
    for a in all_alarms:
        imei   = str(a.get("imei") or "").strip()
        circle = imei_circle.get(imei) or (a.get("state_name") or "Unknown").strip()
        circle_imei_alarms.setdefault(circle, {}).setdefault(imei, []).append(a)

    period_min = period_days * 1440
    rows = []
    for circle in sorted(set(circle_imeis) | set(circle_imei_alarms)):
        if circle in ("Unknown", ""):
            continue

        total_sites      = len(circle_imeis.get(circle, set()))
        imei_alarms_map  = circle_imei_alarms.get(circle, {})
        circle_outage    = 0
        down_sites_detail = []

        for imei, site_alarms in imei_alarms_map.items():
            crit = [a for a in site_alarms if is_critical_alarm(a)]
            if not crit:
                continue

            crit_sorted  = sorted(crit, key=lambda x: x.get("start_time") or "")
            all_resolved = all(not is_active_alarm(a) for a in crit)

            down_time  = _fmt_alarm_time(crit_sorted[0].get("start_time"))
            if all_resolved:
                latest_end = max((a.get("end_time") or "") for a in crit)
                restored   = _fmt_alarm_time(latest_end)
            else:
                restored = "Active"

            outage_min = round(sum(_alarm_duration_min(a) or 0 for a in crit))
            circle_outage += outage_min
            uptime_pct = round(max(0.0, (period_min - outage_min) / period_min * 100), 2) if period_min > 0 else 100.0

            alarm_names = ", ".join(sorted({
                (a.get("alarm_name") or "").strip()
                for a in site_alarms if a.get("alarm_name")
            }))

            cluster   = next((a.get("district_name") or a.get("district") for a in site_alarms
                              if a.get("district_name") or a.get("district")), "—")
            site_name = next((a.get("site_name") for a in site_alarms if a.get("site_name")), "—")

            down_sites_detail.append({
                "site_name":  site_name,
                "cluster":    cluster or "—",
                "down_time":  down_time,
                "restored":   restored,
                "outage_min": outage_min,
                "uptime_pct": uptime_pct,
                "alarm":      alarm_names,
                "status":     "Closed" if all_resolved else "Active",
                "imei":       imei,
            })

        down_sites_detail.sort(key=lambda x: x["outage_min"], reverse=True)

        total_min  = period_min * total_sites
        uptime_pct = round(max(0.0, (total_min - circle_outage) / total_min * 100), 2) if total_min > 0 else 100.0
        rows.append({
            "circle":      circle,
            "total_sites": total_sites,
            "sites_down":  len(down_sites_detail),
            "outage_min":  circle_outage,
            "uptime_pct":  uptime_pct,
            "down_sites":  down_sites_detail,
        })

    rows.sort(key=lambda x: x["sites_down"], reverse=True)

    total_row = {
        "circle":      "Total",
        "total_sites": sum(r["total_sites"] for r in rows),
        "sites_down":  sum(r["sites_down"]  for r in rows),
        "outage_min":  sum(r["outage_min"]  for r in rows),
        "uptime_pct":  None,
    }
    return {
        "rows":         rows,
        "total":        total_row,
        "generated_at": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "range":        rng,
    }


@app.get("/ANALYTICS-DATA")
def analytics_data_api(rng: str = Query("24h", alias="range"), db: Session = Depends(get_db)):
    today     = datetime.now().date()
    yesterday = today - timedelta(days=1)

    if rng == "3d":
        primary_days = 3
    elif rng == "7d":
        primary_days = 7
    elif rng == "30d":
        primary_days = 30
    else:
        primary_days = 1

    primary_dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(primary_days)]
    # Always include yesterday for the 24-hour alarm timeline
    all_dates     = sorted(set(primary_dates + [yesterday.strftime("%Y-%m-%d")]))

    sites      = get_sites(db)
    total_sites_count = len(sites)
    daily_data = _fetch_days_cached(db, all_dates)

    primary_alarms = [a for d in primary_dates for a in daily_data.get(d, [])]
    all_alarms_all = [a for v in daily_data.values() for a in v]

    # ── Headline KPIs ──
    critical_outage = sum(_alarm_duration_min(a) or 0 for a in primary_alarms if is_critical_alarm(a))
    total_minutes   = primary_days * 1440 * total_sites_count
    fleet_uptime    = round(max(0.0, (total_minutes - critical_outage) / total_minutes * 100), 1) if total_minutes > 0 else 100.0

    resolved_crit   = [a for a in primary_alarms if is_critical_alarm(a) and not is_active_alarm(a)]
    mttr_vals       = [v for a in resolved_crit if (v := _alarm_duration_min(a)) and v > 0]
    mttr_min        = round(sum(mttr_vals) / len(mttr_vals), 1) if mttr_vals else 0

    sites_down = len({str(a.get("imei")).strip() for a in primary_alarms
                      if is_critical_alarm(a) and is_active_alarm(a)})
    total_alarms = len(primary_alarms)

    # ── Downtime by Reason ──
    reason_map: dict = {}
    for a in primary_alarms:
        name = (a.get("alarm_name") or "Unknown").strip()
        dur  = _alarm_duration_min(a) or 0
        reason_map.setdefault(name, {"hours": 0.0, "count": 0})
        reason_map[name]["hours"] += dur / 60
        reason_map[name]["count"] += 1
    downtime_by_reason = sorted(
        [{"name": k, "hours": round(v["hours"], 1), "count": v["count"]} for k, v in reason_map.items()],
        key=lambda x: x["hours"], reverse=True,
    )[:10]

    # ── Alarms by State ──
    state_map: dict = {}
    for a in primary_alarms:
        s = (a.get("state_name") or "Unknown").strip()
        state_map[s] = state_map.get(s, 0) + 1
    state_total = sum(state_map.values()) or 1
    alarms_by_state = sorted(
        [{"name": k, "count": v, "pct": round(v / state_total * 100, 1)} for k, v in state_map.items()],
        key=lambda x: x["count"], reverse=True,
    )

    # ── Resolve Trend (per day) ──
    resolve_trend = []
    for d in sorted(primary_dates):
        day_res  = [a for a in daily_data.get(d, []) if not is_active_alarm(a)]
        day_vals = [v for a in day_res if (v := _alarm_duration_min(a)) and v > 0]
        resolve_trend.append({"date": d, "avg_min": round(sum(day_vals) / len(day_vals), 1) if day_vals else 0})

    # ── Active vs Resolved (per day) ──
    active_vs_resolved = []
    for d in sorted(primary_dates):
        day_alarms = daily_data.get(d, [])
        active_vs_resolved.append({
            "date":     d,
            "active":   sum(1 for a in day_alarms if is_active_alarm(a)),
            "resolved": sum(1 for a in day_alarms if not is_active_alarm(a)),
        })

    # ── Alarm Timeline (last 24 h hourly from all_alarms_all) ──
    now = datetime.now()
    bucket_times = [(now - timedelta(hours=23-i)) for i in range(24)]
    # label includes full datetime so frontend can show "May 7, 05:00" in tooltip
    buckets = [{"label": bt.strftime("%Y-%m-%d %H:00"), "tick": bt.strftime("%H:00"), "count": 0}
               for bt in bucket_times]
    for a in all_alarms_all:
        st = a.get("start_time")
        if not st:
            continue
        try:
            t = datetime.strptime(str(st).strip(), "%Y-%m-%d %H:%M:%S")
            diff = (now - t).total_seconds() / 3600
            if 0 <= diff < 24:
                idx = 23 - int(diff)
                if 0 <= idx < 24:
                    buckets[idx]["count"] += 1
        except Exception:
            pass

    # ── Worst-Performing Sites ──
    site_stats: dict = {}
    for a in primary_alarms:
        imei = str(a.get("imei") or "").strip()
        if not imei:
            continue
        if imei not in site_stats:
            site_stats[imei] = {
                "site_name":  a.get("site_name") or "—",
                "global_id":  a.get("globel_id") or "—",
                "outage_min": 0, "alarm_count": 0,
            }
        site_stats[imei]["alarm_count"] += 1
        if is_critical_alarm(a):
            site_stats[imei]["outage_min"] += _alarm_duration_min(a) or 0

    period_min = primary_days * 1440
    worst_sites = []
    for imei, s in site_stats.items():
        downtime_h = round(s["outage_min"] / 60, 1)
        uptime_pct = round(max(0.0, (period_min - s["outage_min"]) / period_min * 100), 1) if period_min > 0 else 100.0
        worst_sites.append({**s, "imei": imei, "downtime_h": downtime_h, "uptime_pct": uptime_pct})
    worst_sites = sorted(worst_sites, key=lambda x: x["downtime_h"], reverse=True)[:20]

    return {
        "fleet_uptime":       fleet_uptime,
        "mttr_min":           mttr_min,
        "sites_down":         sites_down,
        "total_alarms":       total_alarms,
        "downtime_by_reason": downtime_by_reason,
        "alarms_by_state":    alarms_by_state,
        "resolve_trend":      resolve_trend,
        "active_vs_resolved": active_vs_resolved,
        "alarm_timeline":     buckets,
        "worst_sites":        worst_sites,
    }


# =====================================================
# CONSOLIDATED ENDPOINTS  (single fetch for each page)
# =====================================================

@app.get("/SITE-DASHBOARD-ALL")
def site_dashboard_all(date: str = None, db: Session = Depends(get_db)):
    """Returns all site-dashboard data in one call — sites + alarms fetched once."""
    try:
        d      = date or datetime.now().strftime("%Y-%m-%d")
        sites  = get_sites(db)
        alarms = get_alarms(db, d, d)

        # ── Stats ──
        durations = [dur for a in alarms if (dur := _alarm_duration_min(a)) is not None]
        stats = {
            "total_active_sites":         len(sites),
            "total_alarm_events":         len(alarms),
            "unique_alarm_sites":         len({str(a.get("imei","")).strip() for a in alarms if a.get("imei")}),
            "circles_affected":           len({str(a.get("state_name","")).strip() for a in alarms if a.get("state_name")}),
            "avg_alarm_duration_minutes": round(sum(durations)/len(durations), 2) if durations else 0,
        }

        # ── Active site list ──
        active_list = [{
            "site_id":            s.get("site_code") or s.get("globel_id") or "—",
            "site_name":          s.get("site_name") or "—",
            "circle":             s.get("state") or s.get("state_name") or s.get("circle") or "—",
            "h1":                 s.get("h1") or s.get("district") or s.get("cluster") or "—",
            "h2":                 s.get("h2") or "—",
            "imei_no":            s.get("gsm_imei_no") or "—",
            "battery_v":          s.get("battery_v") or s.get("battery") or "—",
            "signal_dbm":         s.get("signal_dbm") or s.get("signal") or "—",
            "last_communication": s.get("last_communication") or s.get("last_sync") or "—",
            "aging":              s.get("aging") or "—",
        } for s in sites]

        # ── Alarm list ──
        alarm_list = []
        for a in alarms:
            dur_min = _alarm_duration_min(a)
            dur_str = f"{int(dur_min)//60:02d}:{int(dur_min)%60:02d}:00" if dur_min is not None else "—"
            alarm_list.append({
                "global_id":        a.get("globel_id") or "—",
                "site_name":        a.get("site_name") or "—",
                "circle":           a.get("state_name") or "—",
                "district":         a.get("district") or "—",
                "cluster":          a.get("cluster") or "—",
                "alarm_type":       a.get("alarm_name") or "—",
                "alarm_start_time": a.get("start_time") or "—",
                "alarm_end_time":   a.get("end_time") or "—",
                "duration":         dur_str,
                "battery_start_v":  "—",
                "battery_end_v":    a.get("volt") or "—",
                "imei":             a.get("imei") or "—",
            })

        # ── Alarm trend (hourly) ──
        hourly = {h: 0 for h in range(24)}
        for a in alarms:
            st = a.get("start_time") or ""
            if len(st) >= 13:
                try:    hourly[int(st[11:13])] += 1
                except: pass
        alarm_trend = [{"hour": f"{h:02d}:00", "count": hourly[h]} for h in range(24)]

        # ── Alarm by type ──
        type_map = {}
        for a in alarms:
            n = (a.get("alarm_name") or "Unknown").strip()
            type_map[n] = type_map.get(n, 0) + 1
        alarm_by_type = sorted([{"alarm_type": k, "count": v} for k, v in type_map.items()], key=lambda x: x["count"], reverse=True)

        # ── Alarm by circle ──
        cmap = {}
        for a in alarms:
            c = (a.get("state_name") or "").strip()
            if c:
                cmap[c] = cmap.get(c, 0) + 1
        alarm_by_circle = sorted([{"circle": k, "count": v} for k, v in cmap.items()], key=lambda x: x["count"], reverse=True)

        # ── Active by circle ──
        active_alarms_now = [a for a in alarms if is_active_alarm(a)]
        imei_to_circle = {}
        for a in alarms:
            imei = str(a.get("imei","")).strip()
            circ = (a.get("state_name") or "").strip()
            if imei and circ and imei not in imei_to_circle:
                imei_to_circle[imei] = circ
        # Only sites with an active MNSF or BTLV alarm count as down
        down_imeis = {str(a.get("imei","")).strip() for a in active_alarms_now if is_critical_alarm(a)}
        abc_map = {}
        for s in sites:
            imei = str(s.get("gsm_imei_no","")).strip()
            if imei in down_imeis:
                continue
            circ = (imei_to_circle.get(imei) or s.get("state") or s.get("state_name") or s.get("circle") or "Unknown").strip() or "Unknown"
            abc_map[circ] = abc_map.get(circ, 0) + 1
        active_by_circle = sorted([{"circle": k, "count": v} for k, v in abc_map.items()], key=lambda x: x["count"], reverse=True)

        # ── Down list — only currently active critical alarms ──
        down_seen = {}
        for a in active_alarms_now:
            if not is_critical_alarm(a):
                continue
            imei = str(a.get("imei","")).strip()
            if imei and imei not in down_seen:
                down_seen[imei] = {
                    "site_name": a.get("site_name"),
                    "global_id": a.get("globel_id"),
                    "circle":    a.get("state_name"),
                    "alarm":     a.get("alarm_name"),
                    "since":     a.get("start_time"),
                }

        return {
            "stats":            stats,
            "active_list":      active_list,
            "alarm_list":       alarm_list,
            "alarm_trend":      alarm_trend,
            "alarm_by_type":    alarm_by_type,
            "alarm_by_circle":  alarm_by_circle,
            "active_by_circle": active_by_circle,
            "down_list":        list(down_seen.values()),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/SITE-MONITORING-ALL")
def site_monitoring_all(date: str = None, db: Session = Depends(get_db)):
    """Returns all site-monitoring page data in one call — sites + alarms fetched once."""
    try:
        today  = date or datetime.now().strftime("%Y-%m-%d")
        sites  = get_sites(db)
        alarms = get_alarms(db, today, today)

        # ── Up/down classification ──
        alarm_map = {}
        for a in alarms:
            alarm_map.setdefault(str(a.get("imei","")).strip(), []).append(a)

        up_sites, down_sites = [], []
        for site in sites:
            imei     = str(site.get("gsm_imei_no","")).strip()
            critical = [a for a in alarm_map.get(imei, []) if is_critical_alarm(a)]
            if critical:
                latest = sorted(critical, key=lambda x: x.get("start_time",""), reverse=True)[0]
                down_sites.append({"site_name": site.get("site_name"), "global_id": site.get("globel_id"),
                                   "imei": imei, "status": "DOWN",
                                   "alarm": latest.get("alarm_name"), "since": latest.get("start_time"),
                                   "end_time": latest.get("end_time")})
            else:
                up_sites.append({"site_name": site.get("site_name"), "global_id": site.get("globel_id"),
                                  "imei": imei, "status": "UP", "since": "Running"})

        total = len(sites)
        def _has(a, *kw):
            n = (a.get("alarm_name") or "").upper()
            return any(k in n for k in kw)

        active_alarms = [a for a in alarms if is_active_alarm(a)]

        summary = {
            "total_sites":  total,
            "up_sites":     len(up_sites),
            # Sites Down = unique sites with an active MNSF, BTLV, or Fibre Cut alarm right now
            "down_sites":   len({str(a.get("imei","")).strip() for a in active_alarms if _has(a,"MNSF","BTLV","L LVD CUT","FIBRE CUT","FIBER CUT","FIBRE","FIBER")}),
            "total_alarms": len(alarms),
            # Mains Failed = unique sites with an active MNSF alarm right now
            "mains_failed": len({str(a.get("imei","")).strip() for a in active_alarms if _has(a,"MNSF","MAINS","MAIN FAIL")}),
            # Battery Low = unique sites with an active BTLV alarm right now
            "battery_low":  len({str(a.get("imei","")).strip() for a in active_alarms if _has(a,"BTLV","LVD")}),
            "healthy_pct":  round(len(up_sites)/total*100) if total else 0,
        }

        # ── Alarms feed (SITE-ALARMS format) ──
        alarms_out = []
        for a in alarms:
            volt = a.get("volt")
            alarms_out.append({
                "imei":       str(a.get("imei","")).strip(),
                "site_name":  a.get("site_name"),
                "global_id":  a.get("globel_id"),
                "alarm_name": a.get("alarm_name"),
                "start_time": a.get("start_time"),
                "end_time":   a.get("end_time"),
                "state_name": a.get("state_name"),
                "district":   a.get("district_name") or a.get("district"),
                "volt":       volt if volt else None,
                "is_active":  is_active_alarm(a),
            })
        alarms_out.sort(key=lambda x: x["start_time"] or "", reverse=True)
        alarms_out.sort(key=lambda x: not x["is_active"])

        # ── Site list (SITE-ACTIVE-LIST format) ──
        site_list = [{
            "site_id":            s.get("site_code") or s.get("globel_id") or "—",
            "site_name":          s.get("site_name") or "—",
            "circle":             s.get("state") or s.get("state_name") or s.get("circle") or "—",
            "h1":                 s.get("h1") or s.get("district") or s.get("cluster") or "—",
            "h2":                 s.get("h2") or "—",
            "imei_no":            s.get("gsm_imei_no") or "—",
            "battery_v":          s.get("battery_v") or s.get("battery") or "—",
            "signal_dbm":         s.get("signal_dbm") or s.get("signal") or "—",
            "last_communication": s.get("last_communication") or s.get("last_sync") or "—",
            "aging":              s.get("aging") or "—",
        } for s in sites]

        return {"summary": summary, "alarms": alarms_out, "site_list": site_list}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# =====================================================
# CACHE MANAGEMENT ENDPOINTS
# =====================================================

@app.post("/REFRESH-CACHE")
def refresh_cache(db: Session = Depends(get_db)):
    """Manually refresh the sites and today's alarms cache."""
    import threading
    def _do_refresh():
        ddb = SessionLocal()
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            n_sites  = cache_sites_to_db(ddb)
            n_alarms = cache_alarms_to_db(ddb, [today])
            print(f"[Manual Refresh] {n_sites} sites, {n_alarms} alarms cached")
        except Exception as e:
            print(f"[Manual Refresh] Error: {e}")
        finally:
            ddb.close()
    threading.Thread(target=_do_refresh, daemon=True).start()
    return {"status": "refreshing", "message": "Cache refresh started in background"}


@app.get("/CACHE-STATUS")
def cache_status(db: Session = Depends(get_db)):
    """Return cache statistics."""
    site_count  = db.query(models.CachedSite).count()
    alarm_count = db.query(models.CachedAlarm).count()
    alarm_dates = db.query(models.CachedAlarm.alarm_date).distinct().all()
    last_site   = db.query(models.CachedSite.fetched_at).order_by(models.CachedSite.fetched_at.desc()).first()
    last_alarm  = db.query(models.CachedAlarm.fetched_at).order_by(models.CachedAlarm.fetched_at.desc()).first()
    return {
        "cached_sites":          site_count,
        "cached_alarms":         alarm_count,
        "cached_alarm_dates":    sorted([r[0] for r in alarm_dates]),
        "sites_last_refreshed":  str(last_site[0]) if last_site else None,
        "alarms_last_refreshed": str(last_alarm[0]) if last_alarm else None,
    }


class SendReportBody(PydanticBaseModel):
    extra_recipients: List[str] = []

@app.post("/SEND-DAILY-REPORT")
def trigger_send_daily_report(
    test_mode:   bool = False,
    report_date: str  = None,
    body: SendReportBody = SendReportBody(),
):
    """
    Manually triggers the daily report send.
    ?test_mode=true       → sends only to TEST_RECIPIENTS.
    ?report_date=YYYY-MM-DD → overrides the date shown in the report (default: today).
    body.extra_recipients → ad-hoc CCs added only for this send.
    """
    import importlib, services.notification_service as _ns
    importlib.reload(_ns)
    result = _ns.send_report_now(
        test_mode=test_mode,
        extra_recipients=body.extra_recipients or None,
        report_date=report_date,
    )
    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Failed to send report"))
    msg = "Test reports sent to test recipients only." if test_mode else "Daily reports sent successfully."
    return {"status": "success", "message": msg}


@app.get("/DEBUG-CITY-MAP")
def debug_city_map():
    import pandas as pd, os
    emp_path = os.path.join("data", "daily", "employee.xlsx")
    if not os.path.exists(emp_path):
        return {"error": "employee file not found", "path": os.path.abspath(emp_path)}
    df = pd.read_excel(emp_path)
    df.columns = df.columns.astype(str).str.strip()
    cols = list(df.columns)
    city_col = next((c for c in cols if any(x.lower() in c.lower() for x in ["City","Circle","Region","Zone","State","Location"])), None)
    name_col = next((c for c in cols if any(x.lower() in c.lower() for x in ["Full Name","Executive Full","Name"])), None)
    result = {}
    if city_col and name_col:
        for _, row in df.iterrows():
            name = str(row.get(name_col, "")).strip()
            city = str(row.get(city_col, "")).strip()
            if name and city and city.lower() not in ["nan","none",""]:
                result[name] = city
    return {"city_col": city_col, "name_col": name_col, "map": result}


# =====================================================
# RECIPIENTS CONFIGURATION — circle heads + extra CCs
# =====================================================

class CircleHeadBody(PydanticBaseModel):
    circle: str
    head:   str
    email:  str
    phone:  str = ""

class ManagerBody(PydanticBaseModel):
    name:   str
    email:  str
    circle: str = ""

class ManagementRecipientBody(PydanticBaseModel):
    name:  str
    email: str

class ExtraRecipientsBody(PydanticBaseModel):
    emails: List[str]

@app.get("/REPORTING-CONFIG")
def get_reporting_config():
    from services.notification_service import _read_config, CIRCLE_HEADS, get_extra_recipients
    cfg = _read_config()
    # Seed from hardcoded if config file has no circle_heads yet
    if not cfg.get("circle_heads"):
        cfg["circle_heads"] = [
            {"circle": k, "head": v["head"], "email": v["email"], "phone": v.get("phone", "")}
            for k, v in CIRCLE_HEADS.items()
        ]
    cfg.setdefault("extra_recipients", [])
    cfg.setdefault("managers", [])
    cfg.setdefault("management_recipients", [])
    return cfg

@app.post("/REPORTING-CONFIG/CIRCLE-HEADS")
def add_circle_head(body: CircleHeadBody):
    from services.notification_service import _read_config, _write_config, CIRCLE_HEADS
    cfg = _read_config()
    if not cfg.get("circle_heads"):
        cfg["circle_heads"] = [
            {"circle": k, "head": v["head"], "email": v["email"], "phone": v.get("phone", "")}
            for k, v in CIRCLE_HEADS.items()
        ]
    if any(ch["circle"] == body.circle for ch in cfg["circle_heads"]):
        raise HTTPException(400, f"Circle '{body.circle}' already exists. Use PUT to update.")
    cfg["circle_heads"].append(body.dict())
    _write_config(cfg)
    return {"status": "ok", "circle_heads": cfg["circle_heads"]}

@app.put("/REPORTING-CONFIG/CIRCLE-HEADS/{circle}")
def update_circle_head(circle: str, body: CircleHeadBody):
    from services.notification_service import _read_config, _write_config, CIRCLE_HEADS
    cfg = _read_config()
    if not cfg.get("circle_heads"):
        cfg["circle_heads"] = [
            {"circle": k, "head": v["head"], "email": v["email"], "phone": v.get("phone", "")}
            for k, v in CIRCLE_HEADS.items()
        ]
    cfg["circle_heads"] = [
        body.dict() if ch["circle"] == circle else ch
        for ch in cfg["circle_heads"]
    ]
    _write_config(cfg)
    return {"status": "ok", "circle_heads": cfg["circle_heads"]}

@app.delete("/REPORTING-CONFIG/CIRCLE-HEADS/{circle}")
def delete_circle_head(circle: str):
    from services.notification_service import _read_config, _write_config, CIRCLE_HEADS
    cfg = _read_config()
    if not cfg.get("circle_heads"):
        cfg["circle_heads"] = [
            {"circle": k, "head": v["head"], "email": v["email"], "phone": v.get("phone", "")}
            for k, v in CIRCLE_HEADS.items()
        ]
    cfg["circle_heads"] = [ch for ch in cfg["circle_heads"] if ch["circle"] != circle]
    _write_config(cfg)
    return {"status": "ok", "circle_heads": cfg["circle_heads"]}

@app.post("/REPORTING-CONFIG/MANAGERS")
def add_manager(body: ManagerBody):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg.setdefault("managers", [])
    if any(m["name"] == body.name for m in cfg["managers"]):
        raise HTTPException(400, f"Manager '{body.name}' already exists. Use PUT to update.")
    cfg["managers"].append(body.dict())
    _write_config(cfg)
    return {"status": "ok", "managers": cfg["managers"]}

@app.put("/REPORTING-CONFIG/MANAGERS/{name}")
def update_manager(name: str, body: ManagerBody):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg.setdefault("managers", [])
    cfg["managers"] = [body.dict() if m["name"] == name else m for m in cfg["managers"]]
    _write_config(cfg)
    return {"status": "ok", "managers": cfg["managers"]}

@app.delete("/REPORTING-CONFIG/MANAGERS/{name}")
def delete_manager(name: str):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg.setdefault("managers", [])
    cfg["managers"] = [m for m in cfg["managers"] if m["name"] != name]
    _write_config(cfg)
    return {"status": "ok", "managers": cfg["managers"]}

@app.put("/REPORTING-CONFIG/EXTRA-RECIPIENTS")
def update_extra_recipients(body: ExtraRecipientsBody):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg["extra_recipients"] = [e.strip() for e in body.emails if e.strip()]
    _write_config(cfg)
    return {"status": "ok", "extra_recipients": cfg["extra_recipients"]}

@app.get("/REPORTING-CONFIG/MANAGEMENT")
def get_management_recipients_config():
    from services.notification_service import _read_config
    return {"management_recipients": _read_config().get("management_recipients", [])}

@app.post("/REPORTING-CONFIG/MANAGEMENT")
def add_management_recipient(body: ManagementRecipientBody):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg.setdefault("management_recipients", [])
    if any(r["email"] == body.email for r in cfg["management_recipients"]):
        raise HTTPException(400, f"'{body.email}' already in management recipients.")
    cfg["management_recipients"].append(body.dict())
    _write_config(cfg)
    return {"status": "ok", "management_recipients": cfg["management_recipients"]}

@app.delete("/REPORTING-CONFIG/MANAGEMENT/{email:path}")
def delete_management_recipient(email: str):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg["management_recipients"] = [
        r for r in cfg.get("management_recipients", []) if r["email"] != email
    ]
    _write_config(cfg)
    return {"status": "ok", "management_recipients": cfg["management_recipients"]}

@app.put("/REPORTING-CONFIG/MANAGEMENT/{email:path}")
def update_management_recipient(email: str, body: ManagementRecipientBody):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    recipients = cfg.get("management_recipients", [])
    cfg["management_recipients"] = [
        {"name": body.name, "email": body.email} if r["email"] == email else r
        for r in recipients
    ]
    _write_config(cfg)
    return {"status": "ok", "management_recipients": cfg["management_recipients"]}

@app.get("/REPORTING-CONFIG/TEST-MODE")
def get_test_mode_status():
    from services.notification_service import _read_config
    cfg = _read_config()
    return {
        "test_mode":  cfg.get("test_mode",  True),
        "test_email": cfg.get("test_email", "pranjalg.work@gmail.com"),
    }

@app.put("/REPORTING-CONFIG/TEST-MODE")
def set_test_mode(body: dict):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg["test_mode"]  = bool(body.get("test_mode", True))
    if "test_email" in body:
        cfg["test_email"] = str(body["test_email"]).strip()
    _write_config(cfg)
    state = "ON" if cfg["test_mode"] else "OFF"
    print(f"[Mail] Test mode {state} — all emails → {cfg.get('test_email', 'pranjalg.work@gmail.com')}")
    return {"test_mode": cfg["test_mode"], "test_email": cfg.get("test_email", "pranjalg.work@gmail.com")}

@app.get("/REPORTING-CONFIG/MAIL-STATUS")
def get_mail_status():
    from services.notification_service import _read_config
    cfg = _read_config()
    return {"mail_enabled": cfg.get("mail_enabled", True)}

@app.put("/REPORTING-CONFIG/MAIL-STATUS")
def set_mail_status(body: dict):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg["mail_enabled"] = bool(body.get("mail_enabled", True))
    _write_config(cfg)
    status = "enabled" if cfg["mail_enabled"] else "disabled"
    print(f"[Mail] Mail sending {status} via portal.")
    return {"mail_enabled": cfg["mail_enabled"]}


@app.get("/PREVIEW-RECIPIENTS")
def preview_recipients():
    """Returns who would receive each email type based on uploaded files."""
    from services.notification_service import get_recipients_preview
    result = get_recipients_preview()
    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Could not build recipient list"))
    return result


@app.post("/SEND-TEST-REPORT/{report_type}")
def trigger_send_test_report(report_type: str, report_date: str = None):
    """
    Sends a single report type as a test to TEST_RECIPIENTS only.
    report_type: "management" | "circles" | "managers"
    ?report_date=YYYY-MM-DD → overrides the date shown in the report (default: today).
    """
    valid = {"management", "circles", "managers"}
    if report_type not in valid:
        raise HTTPException(400, f"Invalid report_type. Must be one of: {sorted(valid)}")
    import importlib, services.notification_service as _ns
    importlib.reload(_ns)
    result = _ns.send_report_now(test_mode=True, send_types={report_type}, report_date=report_date)
    if not result.get("success"):
        raise HTTPException(400, result.get("error", "Failed to send test report"))
    return {"status": "success", "message": f"Test {report_type} report sent to test recipients"}


# =====================================================
# EMAIL REPORT — CLEAR DAILY FILES
# =====================================================

@app.get("/REPORT-FILES-STATUS")
def report_files_status():
    """Returns upload status for each daily report file slot."""
    meta_path = os.path.join(REPORT_DAILY_DIR, "meta.json")
    meta_store = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta_store = json.load(f)

    result = {}
    for key, filename in REPORT_FILE_MAP.items():
        path = os.path.join(REPORT_DAILY_DIR, filename)
        result[key] = {
            "uploaded": os.path.exists(path),
            "meta":     meta_store.get(key)
        }
    return result


def _detect_data_date(contents: bytes, filename: str, file_type: str):
    """
    Tries to detect the data date from an uploaded file.
    Returns 'YYYY-MM-DD' string or None if not determinable.
    Skips master-data files (employee, managers) that have no meaningful date.
    Strategy (in order):
      1. Filename regex — YYYY-MM-DD, YYYYMMDD, DD-MM-YYYY patterns
      2. Column names that parse as dates
      3. Column values in date-named columns
      4. Broad cell-value scan
    """
    if file_type in ("employee", "managers"):
        return None

    # Forms-filled files are exported with today's timestamp in the filename,
    # which would give the wrong date — skip filename detection for them.
    SKIP_FILENAME_DATE = {"forms", "forms_filled", "forms_combined"}

    def _parse_date_str(s, dayfirst=True):
        """Parse a date string, preferring DD-MM-YYYY (Indian format) by default."""
        try:
            d = pd.to_datetime(s, dayfirst=dayfirst, errors="coerce")
            if pd.isnull(d):
                d = pd.to_datetime(s, dayfirst=(not dayfirst), errors="coerce")
            if not pd.isnull(d) and 2020 <= d.year <= 2035:
                return str(d.date())
        except Exception:
            pass
        return None

    def _most_common_date(series, dayfirst=True):
        """Parse a pandas Series of date strings and return the most frequent date."""
        parsed = pd.to_datetime(series, dayfirst=dayfirst, errors="coerce").dropna()
        if len(parsed) == 0:
            parsed = pd.to_datetime(series, dayfirst=(not dayfirst), errors="coerce").dropna()
        if len(parsed) > 0:
            return str(parsed.dt.date.value_counts().idxmax())
        return None

    # ── 1. Parse date from filename (skipped for forms files) ─────────────
    if file_type not in SKIP_FILENAME_DATE:
        fn = os.path.splitext(filename)[0]
        for pat, day_first in [
            (r'(\d{4}[-_]\d{2}[-_]\d{2})', False),  # YYYY-MM-DD → year first, no dayfirst
            (r'(\d{2}[-_]\d{2}[-_]\d{4})', True),   # DD-MM-YYYY → day first
            (r'(\d{8})',                    False),  # YYYYMMDD
        ]:
            m = re.search(pat, fn)
            if m:
                d = _parse_date_str(m.group(1), dayfirst=day_first)
                if d:
                    return d

    # ── 2–4. Parse from file contents ─────────────────────────────────────
    try:
        is_excel = contents[:2] == b"PK" or filename.lower().endswith((".xlsx", ".xls"))
        if is_excel:
            df = pd.read_excel(BytesIO(contents), dtype=str).fillna("")
        else:
            df = pd.read_csv(BytesIO(contents), dtype=str,
                             encoding="utf-8-sig", on_bad_lines="skip").fillna("")
        df.columns = df.columns.astype(str).str.strip()

        # 2. Column headers that look like dates (catches attendance/distance: "May 6, 2026")
        for col in df.columns:
            d = _parse_date_str(col)
            if d:
                return d

        # 3. Columns with date-like names (catches forms: "Action Date" → "2026-05-08")
        date_hints = ["action date", "date", "day", "sodn start", "sodn_start",
                      "start time", "alarm start", "created", "timestamp", "reported"]
        for col in df.columns:
            if any(h in col.lower() for h in date_hints):
                sample = df[col].replace("", pd.NA).dropna().head(50)
                d = _most_common_date(sample)
                if d:
                    return d

        # 4. Broad scan — first column where 60%+ values parse as dates
        for col in df.columns:
            sample = df[col].replace("", pd.NA).dropna().head(10)
            if len(sample) == 0:
                continue
            parsed = pd.to_datetime(sample, dayfirst=True, errors="coerce").dropna()
            if len(parsed) >= max(1, len(sample) * 0.6):
                return str(parsed.dt.date.value_counts().idxmax())
    except Exception:
        pass
    return None


@app.post("/SCAN-FILE-DATES")
def scan_file_dates():
    """Re-scans all uploaded daily files and updates data_date in metadata."""
    meta_path  = os.path.join(REPORT_DAILY_DIR, "meta.json")
    meta_store = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta_store = json.load(f)

    updated = {}
    for file_type, filename in REPORT_FILE_MAP.items():
        path = os.path.join(REPORT_DAILY_DIR, filename)
        if not os.path.exists(path):
            continue
        if meta_store.get(file_type, {}).get("data_date"):
            updated[file_type] = meta_store[file_type]["data_date"]
            continue  # already detected, skip
        try:
            with open(path, "rb") as f:
                contents = f.read()
            data_date = _detect_data_date(contents, filename, file_type)
            if data_date:
                if file_type not in meta_store:
                    meta_store[file_type] = {}
                meta_store[file_type]["data_date"] = data_date
                updated[file_type] = data_date
        except Exception:
            pass

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta_store, f, indent=2)

    return {"scanned": updated}


@app.post("/UPLOAD-REPORT-FILE")
async def upload_report_file(
    file_type: str      = Form(...),
    file:      UploadFile = File(...),
):
    """Saves an uploaded daily report file into data/daily/ and records metadata."""
    if file_type not in REPORT_FILE_MAP:
        raise HTTPException(400, f"Unknown file_type '{file_type}'. Valid: {list(REPORT_FILE_MAP)}")

    filename  = REPORT_FILE_MAP[file_type]
    dest_path = os.path.join(REPORT_DAILY_DIR, filename)

    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    data_date = _detect_data_date(contents, file.filename or filename, file_type)

    # Update per-key metadata in meta.json
    meta_path  = os.path.join(REPORT_DAILY_DIR, "meta.json")
    meta_store = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta_store = json.load(f)

    from datetime import datetime as _dt
    meta_store[file_type] = {
        "uploaded_at":   _dt.utcnow().strftime("%Y-%m-%dT%H:%M:%S") + "Z",
        "original_name": file.filename,
        "size_bytes":    len(contents),
        "data_date":     data_date,
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta_store, f, indent=2)

    return {"status": "ok", "key": file_type, "saved_as": filename, "data_date": data_date}


@app.post("/CLEAR-REPORT-FILES")
def clear_report_files():
    """Deletes all files in data/daily/ so the operator can start fresh for today."""
    import json as _json

    deleted = []
    for key, filename in REPORT_FILE_MAP.items():
        path = os.path.join(REPORT_DAILY_DIR, filename)
        if os.path.exists(path):
            os.remove(path)
            deleted.append(filename)

    meta_path = os.path.join(REPORT_DAILY_DIR, "meta.json")
    if os.path.exists(meta_path):
        os.remove(meta_path)

    return {"status": "success", "cleared": deleted}


# =====================================================
# EMAIL REPORT — DATA PREVIEWS
# =====================================================

@app.get("/REPORT-PREVIEW/FORMS")
def preview_forms(db: Session = Depends(get_db)):
    """
    Returns form submission counts per user for the most recent upload date.
    Used by the Email Reports page to preview what will appear in the emails.
    """
    from sqlalchemy import func as _func
    from models import FormEntry

    latest_date = db.query(_func.max(FormEntry.selected_date)).scalar()
    if not latest_date:
        return {"date": None, "rows": []}

    results = (
        db.query(
            FormEntry.username,
            FormEntry.form_type,
            _func.count(FormEntry.id).label("count"),
        )
        .filter(
            FormEntry.selected_date == latest_date,
            FormEntry.row_status == "valid",
        )
        .group_by(FormEntry.username, FormEntry.form_type)
        .order_by(FormEntry.username)
        .all()
    )

    # Group by username → list of {form_type, count}
    from collections import defaultdict as _dd
    grouped = _dd(list)
    for r in results:
        grouped[r.username].append({"form_type": r.form_type, "count": r.count})

    rows = [
        {"username": u, "forms": f, "total": sum(x["count"] for x in f)}
        for u, f in grouped.items()
    ]
    rows.sort(key=lambda x: -x["total"])

    return {"date": str(latest_date), "rows": rows}


@app.get("/REPORT-PREVIEW/MANAGERS")
def preview_managers():
    """
    Reads the uploaded manager/employee file and returns:
    - all column names found
    - grouped manager → team list
    Tries managers.xlsx first, falls back to employee.xlsx.
    """
    # Prefer the dedicated managers file, fall back to employee file
    for fname in ["managers.xlsx", "employee.xlsx"]:
        path = os.path.join(REPORT_DAILY_DIR, fname)
        if os.path.exists(path):
            break
    else:
        return {"uploaded": False, "columns": [], "managers": {}}

    try:
        df = pd.read_excel(path)
        df.columns = df.columns.astype(str).str.strip()
        actual_columns = list(df.columns)

        def find_col(candidates):
            for c in candidates:
                for col in df.columns:
                    if c.lower() in col.lower():
                        return col
            return None

        # Try every likely variation of manager / name / username / city column
        manager_col = find_col([
            "Reporting Manager", "Manager Name", "Manager", "Mgr",
            "Team Lead", "Supervisor", "Head",
        ])
        name_col = find_col([
            "Full Name", "Employee Name", "Emp Name", "Name",
        ])
        user_col = find_col([
            "Field Executive Username", "Username", "User Name",
            "User ID", "Emp ID", "Employee ID", "ID",
        ])
        city_col = find_col([
            "City", "Circle", "Region", "Location", "Zone", "State",
        ])

        if not manager_col:
            return {
                "uploaded": True,
                "columns":  actual_columns,
                "managers": {},
                "error": (
                    f"Could not find a Manager column. "
                    f"Columns in your file: {actual_columns}"
                ),
            }

        managers = {}
        for _, row in df.iterrows():
            mgr = str(row.get(manager_col, "")).strip()
            if not mgr or mgr.lower() in ["nan", "none", ""]:
                mgr = "Unassigned"

            emp = {
                "name":     str(row.get(name_col, "")).strip() if name_col else "",
                "username": str(row.get(user_col, "")).strip() if user_col else "",
                "city":     str(row.get(city_col, "")).strip() if city_col else "",
            }
            managers.setdefault(mgr, []).append(emp)

        return {
            "uploaded":      True,
            "columns":       actual_columns,
            "manager_col":   manager_col,
            "name_col":      name_col,
            "user_col":      user_col,
            "city_col":      city_col,
            "managers":      managers,
            "source_file":   fname,
        }

    except Exception as e:
        return {"uploaded": True, "columns": [], "managers": {}, "error": str(e)}


# =====================================================
# WFH / WFO ANALYSIS
# =====================================================

_WFH_WFO_CONFIG_KEY = "wfh_wfo"
_OFFICE_LOCS_PATH   = os.path.join("data", "office_locations.json")

# Seed defaults used only when office_locations.json does not yet exist
_DEFAULT_OFFICE_SEEDS = [
    {"name": "Delhi",        "lat": 28.476166,  "lng": 77.093109},
    {"name": "KA",           "lat": 12.971262,  "lng": 77.613021},
    {"name": "Maharashtra",  "lat": 18.566991,  "lng": 73.775431},
    {"name": "Mumbai",       "lat": 19.0652005, "lng": 72.9993786},
    {"name": "UPE",          "lat": 26.867925,  "lng": 81.010461},
    {"name": "WB & Kolkata", "lat": 22.572952,  "lng": 88.431080},
]


def _load_offices() -> list:
    if os.path.exists(_OFFICE_LOCS_PATH):
        with open(_OFFICE_LOCS_PATH, encoding="utf-8") as f:
            return json.load(f)
    _save_offices(_DEFAULT_OFFICE_SEEDS)
    return list(_DEFAULT_OFFICE_SEEDS)


def _save_offices(offices: list):
    os.makedirs("data", exist_ok=True)
    with open(_OFFICE_LOCS_PATH, "w", encoding="utf-8") as f:
        json.dump(offices, f, indent=2)


def _get_wfh_wfo_config():
    from services.notification_service import _read_config
    cfg = _read_config().get(_WFH_WFO_CONFIG_KEY, {})
    return {"wfh_travel_km": cfg.get("wfh_travel_km", 2.0)}


def _save_wfh_wfo_config(new_cfg: dict):
    from services.notification_service import _read_config, _write_config
    cfg = _read_config()
    cfg[_WFH_WFO_CONFIG_KEY] = new_cfg
    _write_config(cfg)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


WFH_WFO_RESULTS_PATH = os.path.join("data", "wfh_wfo_results.json")


# ── Office location CRUD ─────────────────────────────────────────────

@app.get("/WFH-WFO/OFFICES")
def get_offices():
    return _load_offices()


class OfficeBody(PydanticBaseModel):
    name: str
    lat:  float
    lng:  float


@app.post("/WFH-WFO/OFFICES")
def add_office(body: OfficeBody):
    offices = _load_offices()
    if any(o["name"] == body.name for o in offices):
        raise HTTPException(400, f"Office '{body.name}' already exists")
    offices.append({"name": body.name, "lat": body.lat, "lng": body.lng})
    _save_offices(offices)
    return offices


@app.put("/WFH-WFO/OFFICES/{name}")
def update_office(name: str, body: OfficeBody):
    offices = _load_offices()
    for o in offices:
        if o["name"] == name:
            o["name"] = body.name
            o["lat"]  = body.lat
            o["lng"]  = body.lng
            _save_offices(offices)
            return offices
    raise HTTPException(404, f"Office '{name}' not found")


@app.delete("/WFH-WFO/OFFICES/{name}")
def delete_office(name: str):
    offices = _load_offices()
    offices = [o for o in offices if o["name"] != name]
    _save_offices(offices)
    return offices


# ── WFH/WFO threshold config ─────────────────────────────────────────

@app.get("/WFH-WFO/CONFIG")
def get_wfh_wfo_config():
    return _get_wfh_wfo_config()


class WfhWfoConfigBody(PydanticBaseModel):
    wfh_travel_km: float = 2.0


@app.put("/WFH-WFO/CONFIG")
def update_wfh_wfo_config(body: WfhWfoConfigBody):
    _save_wfh_wfo_config({"wfh_travel_km": body.wfh_travel_km})
    return _get_wfh_wfo_config()


@app.get("/WFH-WFO/STATUS")
def wfh_wfo_status():
    if os.path.exists(WFH_WFO_RESULTS_PATH):
        with open(WFH_WFO_RESULTS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"results": [], "analyzed_at": None}


@app.delete("/WFH-WFO/RESULTS")
def wfh_wfo_clear():
    if os.path.exists(WFH_WFO_RESULTS_PATH):
        os.remove(WFH_WFO_RESULTS_PATH)
    return {"ok": True}


@app.post("/WFH-WFO/ANALYZE")
async def wfh_wfo_analyze(files: List[UploadFile] = File(...)):
    cfg        = _get_wfh_wfo_config()
    wfh_travel = cfg["wfh_travel_km"]
    offices    = _load_offices()

    # Pre-compute rounded office coordinates (4 dp ≈ 11 m precision)
    office_pts = [(o["name"], round(o["lat"], 4), round(o["lng"], 4)) for o in offices]

    results = []

    for upload in files:
        filename = upload.filename or "unknown"
        try:
            raw = await upload.read()
            df  = pd.read_csv(BytesIO(raw), dtype=str, encoding="utf-8-sig")
            df.columns = df.columns.str.strip()

            # Extract username from tracker_id (format: devicehex@username)
            if "tracker_id" not in df.columns:
                results.append({"file": filename, "error": "Missing 'tracker_id' column"})
                continue

            tracker_sample = df["tracker_id"].dropna().iloc[0] if not df["tracker_id"].dropna().empty else ""
            if "@" not in tracker_sample:
                results.append({"file": filename, "error": "Cannot extract username: '@' not found in tracker_id"})
                continue
            username = tracker_sample.split("@")[-1].strip()

            if "lat" not in df.columns or "lng" not in df.columns:
                results.append({"file": filename, "username": username, "error": "Missing 'lat' or 'lng' column"})
                continue

            df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
            df["lng"] = pd.to_numeric(df["lng"], errors="coerce")
            valid_pts = df[
                (df["lat"] != 0) & (df["lng"] != 0) &
                df["lat"].notna() & df["lng"].notna()
            ]
            total_points = len(valid_pts)

            if total_points == 0:
                results.append({
                    "username": username, "status": "WFH",
                    "matched_office": None, "total_travel_km": 0.0, "total_points": 0,
                })
                continue

            import numpy as np
            lats = valid_pts["lat"].to_numpy(dtype=float)
            lngs = valid_pts["lng"].to_numpy(dtype=float)

            # ── WFO: exact coordinate match (rounded to 4 decimal places) ──
            matched_office = None
            if office_pts:
                user_rounded = set(zip(np.round(lats, 4), np.round(lngs, 4)))
                for o_name, o_lat, o_lng in office_pts:
                    if (o_lat, o_lng) in user_rounded:
                        matched_office = o_name
                        break

            # ── Total travel distance ────────────────────────────────────
            if len(lats) >= 2:
                dlat_c = np.radians(lats[1:] - lats[:-1])
                dlon_c = np.radians(lngs[1:] - lngs[:-1])
                a_c    = (np.sin(dlat_c/2)**2
                          + np.cos(np.radians(lats[:-1])) * np.cos(np.radians(lats[1:]))
                          * np.sin(dlon_c/2)**2)
                total_travel_km = float((6371 * 2 * np.arctan2(np.sqrt(a_c), np.sqrt(1 - a_c))).sum())
            else:
                total_travel_km = 0.0

            # ── Decision ────────────────────────────────────────────────
            if matched_office:
                status = "WFO"
            elif total_travel_km >= wfh_travel:
                status = "WFH"
            else:
                status = "WFH"  # not at office, minimal movement — still WFH

            results.append({
                "username":        username,
                "status":          status,
                "matched_office":  matched_office,
                "total_travel_km": round(total_travel_km, 4),
                "total_points":    total_points,
            })

        except Exception as e:
            results.append({"file": filename, "error": str(e)})

    os.makedirs("data", exist_ok=True)
    with open(WFH_WFO_RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump({"results": results, "analyzed_at": datetime.now().isoformat()}, f, indent=2)

    return {"results": results}
