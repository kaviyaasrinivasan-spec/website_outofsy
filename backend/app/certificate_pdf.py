# app/certificate_pdf.py
"""Certificate PDF rendering.

Uses reportlab (pure Python) rather than weasyprint, which needs cairo/pango
system libraries -- a needless deployment burden on the VPS.

NOTE ON "DIGITAL SIGNATURE": this produces a QR code linking to a public
verification page, which is what makes a certificate checkable in practice.
A cryptographic PKCS#7 PDF signature is a different thing and needs a real
X.509 signing certificate from a CA -- see sign_pdf() at the bottom.
"""
import io
import logging
from datetime import date
from pathlib import Path
from typing import Optional

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

PAGE = landscape(A4)
W, H = PAGE

NAVY = colors.HexColor("#0A1F44")
ACCENT = colors.HexColor("#5B47F5")
CYAN = colors.HexColor("#22C7D6")
GREY = colors.HexColor("#5A6B87")


def _qr_image(data: str) -> ImageReader:
    qr = qrcode.QRCode(version=1, box_size=10, border=1)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _fit_font(c: canvas.Canvas, text: str, font: str, start: int, max_width: float) -> int:
    """Shrink the font until the text fits -- long names must not overflow."""
    size = start
    while size > 10 and c.stringWidth(text, font, size) > max_width:
        size -= 2
    return size


def render_certificate(
    *,
    output_path: Path,
    student_name: str,
    internship_title: str,
    company_name: str,
    certificate_number: str,
    verification_url: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    duration: Optional[str] = None,
    issued_on: Optional[date] = None,
    signatory_name: str = "Out Of Syllabus",
    signatory_title: str = "Programme Director",
) -> Path:
    """Render a completion certificate to output_path and return it."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output_path), pagesize=PAGE)
    c.setTitle(f"Internship Certificate - {student_name}")
    c.setAuthor("Out Of Syllabus")
    c.setSubject(certificate_number)

    # Outer border
    c.setStrokeColor(NAVY)
    c.setLineWidth(3)
    c.rect(12 * mm, 12 * mm, W - 24 * mm, H - 24 * mm)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.8)
    c.rect(16 * mm, 16 * mm, W - 32 * mm, H - 32 * mm)

    # Header band
    c.setFillColor(NAVY)
    c.rect(16 * mm, H - 46 * mm, W - 32 * mm, 30 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(W / 2, H - 33 * mm, "OUT OF SYLLABUS")
    c.setFont("Helvetica", 10)
    c.drawCentredString(W / 2, H - 41 * mm,
                        "Get Placed Before Your Final Semester Ends")

    # Title
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(W / 2, H - 66 * mm, "CERTIFICATE OF COMPLETION")

    c.setStrokeColor(CYAN)
    c.setLineWidth(2)
    c.line(W / 2 - 45 * mm, H - 71 * mm, W / 2 + 45 * mm, H - 71 * mm)

    # Body
    c.setFillColor(GREY)
    c.setFont("Helvetica", 12)
    c.drawCentredString(W / 2, H - 84 * mm, "This is to certify that")

    name_size = _fit_font(c, student_name, "Helvetica-Bold", 30, W - 90 * mm)
    c.setFillColor(ACCENT)
    c.setFont("Helvetica-Bold", name_size)
    c.drawCentredString(W / 2, H - 98 * mm, student_name)

    c.setFillColor(GREY)
    c.setFont("Helvetica", 12)
    c.drawCentredString(W / 2, H - 110 * mm, "has successfully completed the internship programme")

    role_line = f"{internship_title} at {company_name}"
    role_size = _fit_font(c, role_line, "Helvetica-Bold", 16, W - 80 * mm)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", role_size)
    c.drawCentredString(W / 2, H - 122 * mm, role_line)

    # Dates
    period = ""
    if start_date and end_date:
        period = (f"from {start_date.strftime('%d %b %Y')} "
                  f"to {end_date.strftime('%d %b %Y')}")
    elif duration:
        period = f"Duration: {duration}"
    if period:
        c.setFillColor(GREY)
        c.setFont("Helvetica", 11)
        c.drawCentredString(W / 2, H - 132 * mm, period)

    # Signature block
    sig_x = W - 85 * mm
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.8)
    c.line(sig_x - 30 * mm, 40 * mm, sig_x + 30 * mm, 40 * mm)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(sig_x, 34 * mm, signatory_name)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 9)
    c.drawCentredString(sig_x, 29 * mm, signatory_title)

    # QR + verification details
    qr_x, qr_y, qr_size = 30 * mm, 28 * mm, 26 * mm
    try:
        c.drawImage(_qr_image(verification_url), qr_x, qr_y, qr_size, qr_size,
                    preserveAspectRatio=True, mask="auto")
    except Exception as exc:  # noqa: BLE001 -- a missing QR must not fail issuance
        logger.error("QR generation failed for %s: %s", certificate_number, exc)

    c.setFillColor(GREY)
    c.setFont("Helvetica", 8)
    c.drawString(qr_x + qr_size + 5 * mm, qr_y + 18 * mm, "Scan to verify")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(NAVY)
    c.drawString(qr_x + qr_size + 5 * mm, qr_y + 12 * mm, certificate_number)
    c.setFont("Helvetica", 8)
    c.setFillColor(GREY)
    issued = issued_on or date.today()
    c.drawString(qr_x + qr_size + 5 * mm, qr_y + 6 * mm,
                 f"Issued {issued.strftime('%d %b %Y')}")

    c.showPage()
    c.save()
    return output_path


def sign_pdf(pdf_path: Path) -> bool:
    """Cryptographically sign the PDF. NOT IMPLEMENTED.

    Real PKCS#7 signing needs an X.509 certificate issued by a CA (in India,
    typically eMudhra / Sify / Capricorn), plus a library such as pyHanko.
    That is a procurement decision, not a coding one, so this is left as an
    explicit no-op rather than something that looks signed but is not.

    The QR verification URL already lets anyone confirm a certificate is
    genuine, which covers the practical need.
    """
    logger.info("PDF signing skipped for %s -- no signing certificate configured",
                pdf_path.name)
    return False
