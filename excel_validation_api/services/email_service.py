import os
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders

_EMAIL_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "email_config.json")

def _load_email_config():
    try:
        with open(_EMAIL_CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        email = cfg.get("sender_email", "")
        password = cfg.get("app_password", "")
        smtp_host = cfg.get("smtp_host", "")
        smtp_port = cfg.get("smtp_port", 587)
        # auto-detect host only if not explicitly saved
        if not smtp_host:
            domain = email.split("@")[-1].lower() if "@" in email else ""
            if domain == "gmail.com":
                smtp_host = "smtp.gmail.com"
            elif domain in ("outlook.com", "hotmail.com", "live.com", "msn.com"):
                smtp_host = "smtp-mail.outlook.com"
            else:
                smtp_host = "smtp.office365.com"
        return email, password, smtp_host, int(smtp_port)
    except Exception:
        return "", "", "smtp.office365.com", 587


def send_email(recipients, subject, body, inline_images=None, attachments=None):
    """
    Send an HTML email.
    inline_images: list of (cid_name, bytes_data, mime_subtype)
    attachments:   list of (filename, bytes_data)  e.g. [("report.xlsx", xlsx_bytes)]
    """
    test_address = os.environ.get("TEST_EMAIL")
    if test_address:
        print(f"[Email] TEST MODE — redirecting to {test_address} (original: {recipients})")
        recipients = [test_address]
        subject    = f"[TEST] {subject}"

    # outer container — always mixed so we can attach files
    outer = MIMEMultipart("mixed")
    outer["Subject"] = subject
    outer["To"]      = ", ".join(recipients)

    if inline_images:
        # related wraps html + inline images
        related = MIMEMultipart("related")
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "html"))
        related.attach(alt)
        for cid, img_bytes, subtype in inline_images:
            part = MIMEImage(img_bytes, _subtype=subtype)
            part.add_header("Content-ID", f"<{cid}>")
            part.add_header("Content-Disposition", "inline")
            related.attach(part)
        outer.attach(related)
    else:
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "html"))
        outer.attach(alt)

    if attachments:
        for filename, file_bytes in attachments:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(file_bytes)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            outer.attach(part)

    SENDER_EMAIL, APP_PASSWORD, smtp_host, smtp_port = _load_email_config()
    outer["From"] = SENDER_EMAIL

    server = None
    try:
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.sendmail(SENDER_EMAIL, recipients, outer.as_string())
        print(f"[Email] Sent via {smtp_host}: {subject} to {recipients}")
    except smtplib.SMTPAuthenticationError:
        print(f"[Email] Authentication failed ({smtp_host}) — check sender email / password")
    except smtplib.SMTPException as e:
        print(f"[Email] SMTP error: {e}")
    except Exception as e:
        print(f"[Email] Unexpected error: {e}")
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass
