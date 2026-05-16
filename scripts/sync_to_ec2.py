"""
Fetches alarm + site data from cm.shrotitele.com and pushes to EC2 MySQL.
Runs via GitHub Actions every hour — no laptop needed.
"""

import os, sys, tempfile, requests, pymysql
from datetime import datetime, timedelta
from sshtunnel import SSHTunnelForwarder

EC2_HOST     = "16.170.228.219"
EC2_USER     = "ubuntu"
MYSQL_USER   = "sahi"
MYSQL_PASS   = "Sahi1234"
MYSQL_DB     = "excel_validation_db"
LOCAL_PORT   = 3307
DAYS_TO_SYNC = 7

SITE_API_URL  = "https://cm.shrotitele.com/user_management/api/tpms-tracker/?api_key=MySecretKey@2025"
ALARM_API_URL = "https://cm.shrotitele.com/user_management/alarm-data/"


def write_ssh_key():
    key = os.environ.get("EC2_SSH_KEY", "")
    if not key:
        print("ERROR: EC2_SSH_KEY secret not set")
        sys.exit(1)
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False)
    f.write(key)
    f.close()
    os.chmod(f.name, 0o600)
    return f.name


def fetch_sites():
    try:
        data = requests.get(SITE_API_URL, timeout=30).json().get("data", [])
        print(f"  Fetched {len(data)} sites")
        return data
    except Exception as e:
        print(f"  Site API error: {e}")
        return []


def fetch_alarms(date_str):
    try:
        data = requests.get(
            ALARM_API_URL,
            params={"start_date": date_str, "end_date": date_str},
            timeout=45,
        ).json().get("data", [])
        print(f"  Fetched {len(data)} alarms for {date_str}")
        return data
    except Exception as e:
        print(f"  Alarm API error for {date_str}: {e}")
        return []


def sync_sites(conn):
    sites = fetch_sites()
    if not sites:
        return
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM cached_sites")
        for s in sites:
            cur.execute(
                """INSERT INTO cached_sites
                   (site_id, site_name, circle, h1, h2, imei_no,
                    battery_v, signal_dbm, last_communication, aging, fetched_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    str(s.get("site_code")          or s.get("globel_id")  or ""),
                    str(s.get("site_name")          or ""),
                    str(s.get("state")              or s.get("state_name") or s.get("circle") or ""),
                    str(s.get("h1")                 or s.get("district")   or s.get("cluster") or ""),
                    str(s.get("h2")                 or ""),
                    str(s.get("gsm_imei_no")        or ""),
                    str(s.get("battery_v")          or s.get("battery")    or ""),
                    str(s.get("signal_dbm")         or s.get("signal")     or ""),
                    str(s.get("last_communication") or s.get("last_sync")  or ""),
                    str(s.get("aging")              or ""),
                    now,
                ),
            )
    conn.commit()
    print(f"  Synced {len(sites)} sites to EC2")


def is_active(alarm):
    end = alarm.get("end_time")
    return not end or str(end).strip() in ("", "None", "null")


def sync_alarms(conn):
    today = datetime.now()
    dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(DAYS_TO_SYNC)]
    now   = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    for date_str in dates:
        alarms = fetch_alarms(date_str)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM cached_alarms WHERE alarm_date = %s", (date_str,))
            for a in alarms:
                st         = str(a.get("start_time") or "")
                alarm_date = st[:10] if len(st) >= 10 else date_str
                end_raw    = a.get("end_time")
                cur.execute(
                    """INSERT INTO cached_alarms
                       (global_id, site_name, circle, district, cluster,
                        alarm_name, start_time, end_time, imei, volt,
                        is_active, alarm_date, fetched_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        str(a.get("globel_id")                          or ""),
                        str(a.get("site_name")                          or ""),
                        str(a.get("state_name")                         or ""),
                        str(a.get("district") or a.get("district_name") or ""),
                        str(a.get("cluster")                            or ""),
                        str(a.get("alarm_name")                         or ""),
                        st,
                        str(end_raw) if end_raw and str(end_raw).strip() not in ("", "None", "null") else "",
                        str(a.get("imei")  or ""),
                        str(a.get("volt")  or ""),
                        1 if is_active(a) else 0,
                        alarm_date,
                        now,
                    ),
                )
        conn.commit()
        print(f"  Synced {len(alarms)} alarms for {date_str}")


if __name__ == "__main__":
    print("=== EC2 Sync started ===")

    key_path = write_ssh_key()

    print("Opening SSH tunnel to EC2...")
    with SSHTunnelForwarder(
        (EC2_HOST, 22),
        ssh_username=EC2_USER,
        ssh_pkey=key_path,
        remote_bind_address=("127.0.0.1", 3306),
        local_bind_address=("127.0.0.1", LOCAL_PORT),
    ) as tunnel:
        print("Connecting to MySQL...")
        conn = pymysql.connect(
            host="127.0.0.1", port=LOCAL_PORT,
            user=MYSQL_USER, password=MYSQL_PASS,
            database=MYSQL_DB, charset="utf8mb4",
        )
        print("Syncing sites...")
        sync_sites(conn)
        print(f"Syncing last {DAYS_TO_SYNC} days of alarms...")
        sync_alarms(conn)
        conn.close()

    print("=== Sync complete ===")
