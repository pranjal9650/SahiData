# =====================================================
# SCHEDULER — SINGLE INSTANCE, TWO JOBS
# =====================================================

from apscheduler.schedulers.background import BackgroundScheduler
from database import SessionLocal

_scheduler = BackgroundScheduler()


# =====================================================
# JOB 1 — SITE MONITORING (every 10 min)
# =====================================================

def update_site_monitoring_job():
    print("[Scheduler] Running Site Monitoring Job...")
    db = SessionLocal()
    try:
        # Import inside function to avoid circular import
        from main import build_site_monitoring, save_site_monitoring_to_db
        _, up_sites, down_sites = build_site_monitoring()
        save_site_monitoring_to_db(db, up_sites, down_sites)
        print("[Scheduler] Site Monitoring Updated Successfully")
    except Exception as e:
        print("[Scheduler] Site Monitoring Error:", str(e))
    finally:
        db.close()


# =====================================================
# JOB 2 — CACHE REFRESH (every 10 min)
# =====================================================

def update_cache_job():
    print("[Scheduler] Running Cache Refresh Job...")
    db = SessionLocal()
    try:
        from main import cache_sites_to_db, cache_alarms_to_db
        from datetime import datetime as _dt
        today = _dt.now().strftime("%Y-%m-%d")
        n_sites  = cache_sites_to_db(db)
        n_alarms = cache_alarms_to_db(db, [today])
        print(f"[Scheduler] Cache refreshed — {n_sites} sites, {n_alarms} alarms for {today}")
    except Exception as e:
        print("[Scheduler] Cache Refresh Error:", str(e))
    finally:
        db.close()


# =====================================================
# JOB 3 — DAILY EMAIL REPORT (every day at 18:00)
# =====================================================

def run_daily_report_job():
    print("[Scheduler] Running Daily Email Report Job...")
    try:
        from services.notification_service import send_daily_report
        send_daily_report()
    except Exception as e:
        print("[Scheduler] Daily Report Error:", str(e))


# =====================================================
# START / STOP
# =====================================================

def start_scheduler():
    _scheduler.add_job(
        update_site_monitoring_job,
        trigger="interval",
        minutes=10,
        id="site_monitoring_job",
        replace_existing=True
    )

    _scheduler.add_job(
        update_cache_job,
        trigger="interval",
        minutes=10,
        id="cache_refresh_job",
        replace_existing=True
    )

    _scheduler.start()
    print("[Scheduler] Started — site monitoring + cache refresh every 10 min")


def stop_scheduler():
    if _scheduler.running:
        _scheduler.shutdown()
        print("[Scheduler] Stopped")
