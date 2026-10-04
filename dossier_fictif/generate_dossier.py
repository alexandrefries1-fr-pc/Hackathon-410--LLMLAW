# -*- coding: utf-8 -*-
"""
Generateur du dossier penal fictif "Affaire MARTIN / DUBOIS" (Livrable A).

Produit :
  dossier_fictif/pieces/*.pdf                         une piece par fichier (27 cotes)
  dossier_fictif/DOSSIER_COMPLET_Affaire_Martin_Dubois.pdf   bundle unique avec inventaire et signets

Toutes les personnes, adresses, numeros et organismes prives sont imaginaires.
Les numeros de telephone utilisent les plages reservees a la fiction par l'ARCEP (06 39 98 xx xx, 04 65 71 xx xx).
Les anomalies volontaires sont documentees dans docs/SCENARIO_ET_ANOMALIES.md.

Usage : py generate_dossier.py
"""
import os
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.graphics.shapes import Circle, Drawing, Ellipse, Line, Polygon, Rect, String

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PIECES = os.path.join(HERE, "pieces")
OUT_BUNDLE = os.path.join(HERE, "DOSSIER_COMPLET_Affaire_Martin_Dubois.pdf")

# --------------------------------------------------------------------------------------
# Polices : TTF embarquees (texte extractible proprement par pdf.js), repli sur Helvetica
# --------------------------------------------------------------------------------------
FONT_DIR = r"C:\Windows\Fonts"


def _register(name, files):
    try:
        for style, fname in files.items():
            pdfmetrics.registerFont(TTFont(name + style, os.path.join(FONT_DIR, fname)))
        pdfmetrics.registerFontFamily(name, normal=name, bold=name + "-Bold",
                                      italic=name + "-Italic", boldItalic=name + "-BoldItalic")
        return True
    except Exception:
        return False


HAS_ARIAL = _register("Sans", {"": "arial.ttf", "-Bold": "arialbd.ttf", "-Italic": "ariali.ttf", "-BoldItalic": "arialbi.ttf"})
HAS_TIMES = _register("Serif", {"": "times.ttf", "-Bold": "timesbd.ttf", "-Italic": "timesi.ttf", "-BoldItalic": "timesbi.ttf"})
HAS_COUR = _register("Mono", {"": "cour.ttf", "-Bold": "courbd.ttf", "-Italic": "couri.ttf", "-BoldItalic": "courbi.ttf"})
SANS = "Sans" if HAS_ARIAL else "Helvetica"
SERIF = "Serif" if HAS_TIMES else "Times-Roman"
MONO = "Mono" if HAS_COUR else "Courier"


def bold(f):
    return {"Sans": "Sans-Bold", "Serif": "Serif-Bold", "Mono": "Mono-Bold", "Helvetica": "Helvetica-Bold",
            "Times-Roman": "Times-Bold", "Courier": "Courier-Bold"}[f]


# --------------------------------------------------------------------------------------
# Organismes emetteurs (en-tetes)
# --------------------------------------------------------------------------------------
ORGS = {
    "cic": (["POLICE NATIONALE", "Centre d'information et de commandement de Valmont", "Main courante informatisée"], "MCI n° 2026/093417", SANS),
    "ps": (["POLICE NATIONALE", "Commissariat central de Valmont", "Service de police-secours"], "Procédure n° 2026/004127", SANS),
    "police": (["POLICE NATIONALE", "DIPN de Valmont · Sûreté départementale", "Brigade criminelle"], "Procédure n° 2026/004127", SANS),
    "ij": (["POLICE NATIONALE", "Sûreté départementale de Valmont", "Service local d'identité judiciaire"], "Procédure n° 2026/004127", SANS),
    "srij": (["POLICE NATIONALE", "Service régional d'identité judiciaire de Valmont", "Section traces et empreintes"], "Réf. SRIJ-26-0457", SANS),
    "comm": (["POLICE NATIONALE", "Commissariat central de Valmont", "Bureau des plaintes et main courante"], "MCI n° 2026/011873", SANS),
    "parquet": (["TRIBUNAL JUDICIAIRE DE VALMONT", "Parquet du procureur de la République", ""], "N° Parquet : 26.267.00412", SERIF),
    "ji": (["TRIBUNAL JUDICIAIRE DE VALMONT", "Cabinet n°2 · Mme Nathalie VERGNE", "Juge d'instruction"], "Instruction n° JI 26/00147", SERIF),
    "jld": (["TRIBUNAL JUDICIAIRE DE VALMONT", "Juge des libertés et de la détention", ""], "Instruction n° JI 26/00147", SERIF),
    "iml": (["CENTRE HOSPITALIER UNIVERSITAIRE DE VALMONT", "Institut médico-légal", "Pôle de médecine légale"], "Réf. IML 2026-0388", SANS),
    "snps": (["SERVICE NATIONAL DE POLICE SCIENTIFIQUE", "Laboratoire de police scientifique de Valmont", "Section biologie"], "Réf. LPS-VAL-26-1172", SANS),
    "neotel": (["NEOTEL (opérateur fictif)", "Service des obligations légales", "Réquisitions judiciaires"], "Réponse RJ-2026-08841", SANS),
    "avocat": (["Maître Laurent PEYRAT", "Avocat au barreau de Valmont", "8 place du Palais, Valmont"], "Affaire DUBOIS · JI 26/00147", SERIF),
}

FOOTER = "Pièce entièrement fictive · Hackathon Sciences Po × Mistral AI · Affaire MARTIN / DUBOIS · aucune personne réelle"


# --------------------------------------------------------------------------------------
# Styles
# --------------------------------------------------------------------------------------
def styles_for(font):
    base = ParagraphStyle("body", fontName=font, fontSize=10.5 if font == SANS else 11.5, leading=14.5 if font == SANS else 15,
                          alignment=TA_JUSTIFY, spaceAfter=5)
    return {
        "body": base,
        "small": ParagraphStyle("small", parent=base, fontSize=8.5, leading=11),
        "title": ParagraphStyle("title", parent=base, fontName=bold(font), fontSize=14, leading=18, alignment=TA_CENTER, spaceAfter=2),
        "subtitle": ParagraphStyle("subtitle", parent=base, fontName=bold(font), fontSize=11, leading=14, alignment=TA_CENTER, spaceAfter=10),
        "h": ParagraphStyle("h", parent=base, fontName=bold(font), fontSize=11, leading=14, spaceBefore=8, spaceAfter=4, alignment=TA_LEFT),
        "q": ParagraphStyle("q", parent=base, leftIndent=0, spaceBefore=4),
        "r": ParagraphStyle("r", parent=base, leftIndent=14),
        "quote": ParagraphStyle("quote", parent=base, leftIndent=18, rightIndent=10),
        "right": ParagraphStyle("right", parent=base, alignment=TA_RIGHT),
        "center": ParagraphStyle("center", parent=base, alignment=TA_CENTER),
        "cell": ParagraphStyle("cell", parent=base, fontSize=9, leading=11.5, alignment=TA_LEFT, spaceAfter=0),
        "cellb": ParagraphStyle("cellb", parent=base, fontName=bold(font), fontSize=9, leading=11.5, alignment=TA_LEFT, spaceAfter=0),
        "tiny": ParagraphStyle("tiny", parent=base, fontSize=7.4, leading=9, alignment=TA_LEFT, spaceAfter=0),
    }


class B:
    """Petit DSL pour ecrire le contenu des pieces."""

    def __init__(self, font):
        self.font = font
        self.s = styles_for(font)
        self.flow: List[Flowable] = []

    def p(self, text, style="body"):
        self.flow.append(Paragraph(text, self.s[style]))
        return self

    def h(self, text):
        self.flow.append(CondPageBreak(3 * cm))
        return self.p(text, "h")

    def sp(self, h=6):
        self.flow.append(Spacer(1, h))
        return self

    def title(self, *lines, sub=None):
        for l in lines:
            self.p(l, "title")
        if sub:
            self.p(sub, "subtitle")
        else:
            self.sp(8)
        return self

    def meta(self, rows):
        data = [[Paragraph(f"<b>{k}</b>", self.s["cell"]), Paragraph(v, self.s["cell"])] for k, v in rows]
        t = Table(data, colWidths=[4.2 * cm, 12.6 * cm])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#555555")),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#999999")),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EEF0F3")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        self.flow.append(t)
        self.sp(10)
        return self

    def qa(self, q, r):
        self.flow.append(KeepTogether([Paragraph(f"<b>Question :</b> {q}", self.s["q"]),
                                       Paragraph(f"<b>Réponse :</b> {r}", self.s["r"])]))
        return self

    def table(self, header, rows, widths, style="cell", font_size=None, zebra=True, repeat=1):
        st = self.s[style]
        if font_size:
            st = ParagraphStyle("tcell", parent=st, fontSize=font_size, leading=font_size + 2)
        hb = ParagraphStyle("thead", parent=st, fontName=bold(self.font))
        data = [[Paragraph(c, hb) for c in header]] + [[Paragraph(str(c), st) for c in r] for r in rows]
        t = Table(data, colWidths=widths, repeatRows=repeat)
        cmds = [
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#444444")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#AAAAAA")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDE2EA")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]
        if zebra:
            for i in range(1, len(data)):
                if i % 2 == 0:
                    cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F6F7F9")))
        t.setStyle(TableStyle(cmds))
        self.flow.append(t)
        self.sp(8)
        return self

    def sig(self, *lines, left=None):
        right = "<br/>".join(lines)
        cells = [[Paragraph(left or "", self.s["cell"]), Paragraph(right + "<br/><i>(signé)</i>", self.s["cell"])]]
        t = Table(cells, colWidths=[8.4 * cm, 8.4 * cm])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 14)]))
        self.flow.append(KeepTogether([Spacer(1, 6), t]))
        return self

    def stamp(self, lines, color="#8A1C1C"):
        self.flow.append(StampBox(lines, color, self.font))
        self.sp(8)
        return self

    def drawing(self, d):
        self.flow.append(d)
        return self

    def pb(self):
        self.flow.append(PageBreak())
        return self


class StampBox(Flowable):
    """Tampon de greffe (texte extractible)."""

    def __init__(self, lines, color, font):
        super().__init__()
        self.lines, self.color, self.font = lines, colors.HexColor(color), font
        self.width, self.height = 9.5 * cm, 0.52 * cm * len(lines) + 0.5 * cm

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setStrokeColor(self.color)
        c.setFillColor(self.color)
        c.setLineWidth(1.4)
        c.roundRect(0, 0, self.width, self.height, 6)
        y = self.height - 0.55 * cm
        for i, l in enumerate(self.lines):
            c.setFont(bold(self.font) if i == 0 else self.font, 9.5)
            c.drawString(0.35 * cm, y, l)
            y -= 0.52 * cm
        c.restoreState()


# --------------------------------------------------------------------------------------
# Dessins (photos et images de videoprotection simulees)
# --------------------------------------------------------------------------------------
def photo_frame(label, kind, w=16.8 * cm, h=7.2 * cm):
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#2B2F36"), strokeColor=colors.black))
    gray = colors.HexColor("#8A9099")
    light = colors.HexColor("#C9CED6")
    if kind == "facade":
        d.add(Rect(w * 0.25, 0, w * 0.5, h * 0.92, fillColor=colors.HexColor("#5A6070"), strokeColor=None))
        for r in range(4):
            for c_ in range(5):
                d.add(Rect(w * 0.28 + c_ * w * 0.09, h * 0.2 + r * h * 0.18, w * 0.05, h * 0.1, fillColor=light, strokeColor=None))
        d.add(Rect(w * 0.46, 0, w * 0.08, h * 0.16, fillColor=colors.HexColor("#1D2026"), strokeColor=None))
        d.add(String(w * 0.47, h * 0.17, "14", fontName=SANS, fontSize=9, fillColor=light))
    elif kind == "camera":
        d.add(Line(w * 0.6, h, w * 0.6, h * 0.35, strokeColor=gray, strokeWidth=6))
        d.add(Rect(w * 0.52, h * 0.62, w * 0.14, h * 0.1, fillColor=light, strokeColor=None))
        d.add(String(w * 0.53, h * 0.55, "VP-112", fontName=SANS, fontSize=9, fillColor=light))
    elif kind == "palier":
        for i, n in enumerate(["31", "32", "33"]):
            x = w * (0.15 + i * 0.27)
            d.add(Rect(x, 0, w * 0.13, h * 0.8, fillColor=colors.HexColor("#6B5A48"), strokeColor=light))
            d.add(String(x + w * 0.05, h * 0.83, n, fontName=SANS, fontSize=10, fillColor=light))
        d.add(Polygon([w * 0.42, 0, w * 0.55, h * 0.8, w * 0.55, 0], fillColor=colors.HexColor("#3A3530"), strokeColor=None))
    elif kind == "porte":
        d.add(Rect(w * 0.38, 0, w * 0.22, h * 0.92, fillColor=colors.HexColor("#6B5A48"), strokeColor=light))
        d.add(Polygon([w * 0.6, 0, w * 0.68, h * 0.08, w * 0.68, h * 0.98, w * 0.6, h * 0.92], fillColor=colors.HexColor("#4A3E31"), strokeColor=None))
        d.add(Circle(w * 0.41, h * 0.45, 5, fillColor=light, strokeColor=None))
    elif kind == "sejour":
        d.add(Rect(w * 0.1, h * 0.1, w * 0.3, h * 0.25, fillColor=gray, strokeColor=None))
        d.add(Rect(w * 0.55, h * 0.15, w * 0.15, h * 0.08, fillColor=colors.HexColor("#7A6A55"), strokeColor=None))
        d.add(Polygon([w * 0.75, h * 0.1, w * 0.82, h * 0.35, w * 0.86, h * 0.3, w * 0.79, h * 0.05], fillColor=light, strokeColor=None))
    elif kind == "corps":
        d.add(String(w * 0.5, h * 0.5, "IMAGE NON REPRODUITE (version de démonstration)", fontName=SANS, fontSize=10,
                     fillColor=light, textAnchor="middle"))
    elif kind == "semelle":
        for i in range(9):
            d.add(Line(w * 0.38, h * (0.15 + i * 0.08), w * 0.55, h * (0.2 + i * 0.08), strokeColor=colors.HexColor("#7A2020"), strokeWidth=3))
        d.add(Rect(w * 0.62, h * 0.1, w * 0.02, h * 0.8, fillColor=light, strokeColor=None))
        d.add(String(w * 0.66, h * 0.5, "réglet 10 cm", fontName=SANS, fontSize=8, fillColor=light))
    elif kind == "hall":
        d.add(Rect(w * 0.08, 0, w * 0.12, h * 0.8, fillColor=colors.HexColor("#4C5260"), strokeColor=light))
        d.add(String(w * 0.09, h * 0.83, "Entrée", fontName=SANS, fontSize=8, fillColor=light))
        d.add(Rect(w * 0.72, 0, w * 0.14, h * 0.75, fillColor=colors.HexColor("#3E434D"), strokeColor=light))
        d.add(String(w * 0.73, h * 0.78, "Accès parking", fontName=SANS, fontSize=8, fillColor=light))
        d.add(Rect(w * 0.35, h * 0.3, w * 0.2, h * 0.35, fillColor=colors.HexColor("#59606E"), strokeColor=None))
        d.add(String(w * 0.36, h * 0.67, "Boîtes aux lettres", fontName=SANS, fontSize=8, fillColor=light))
    d.add(String(8, h - 14, label, fontName=SANS, fontSize=9, fillColor=colors.white))
    return d


def cctv_frame(ts, kind, w=16.8 * cm, h=6.6 * cm):
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#1B1E22"), strokeColor=colors.black))
    d.add(Rect(w * 0.3, 0, w * 0.4, h * 0.85, fillColor=colors.HexColor("#30353C"), strokeColor=None))
    d.add(Rect(w * 0.45, 0, w * 0.1, h * 0.35, fillColor=colors.HexColor("#121417"), strokeColor=None))
    sil = colors.HexColor("#5C626B")
    if kind in ("in", "out", "backpack"):
        x = w * (0.5 if kind != "out" else 0.62)
        d.add(Ellipse(x, h * 0.42, 9, 11, fillColor=sil, strokeColor=None))
        d.add(Rect(x - 12, h * 0.08, 24, h * 0.3, fillColor=sil, strokeColor=None))
        if kind == "out":
            d.add(Rect(x + 13, h * 0.12, 14, 18, fillColor=colors.HexColor("#25282C"), strokeColor=None))
        if kind == "backpack":
            d.add(Rect(x - 20, h * 0.2, 10, 20, fillColor=colors.HexColor("#3B4048"), strokeColor=None))
    if kind == "car":
        d.add(Rect(w * 0.05, h * 0.05, w * 0.3, h * 0.2, fillColor=colors.HexColor("#D8DDE4"), strokeColor=None))
        d.add(Rect(w * 0.07, h * 0.16, w * 0.26, h * 0.03, fillColor=colors.HexColor("#2B4C9B"), strokeColor=None))
    d.add(String(8, h - 14, f"VP-112  {ts}", fontName=MONO, fontSize=10, fillColor=colors.HexColor("#E6E6E6")))
    d.add(String(w - 8, 8, "CSU VALMONT · EXTRACTION 26/09/2026", fontName=MONO, fontSize=7, fillColor=colors.HexColor("#9AA0A8"), textAnchor="end"))
    return d


def plan_appartement(w=16.8 * cm, h=8 * cm):
    d = Drawing(w, h)
    stroke = colors.HexColor("#222222")
    d.add(Rect(10, 10, w - 20, h - 20, fillColor=None, strokeColor=stroke, strokeWidth=2))
    d.add(Line(w * 0.42, 10, w * 0.42, h - 10, strokeColor=stroke, strokeWidth=1.5))
    d.add(Line(w * 0.42, h * 0.45, w - 10, h * 0.45, strokeColor=stroke, strokeWidth=1.5))
    d.add(String(w * 0.2, h * 0.85, "SÉJOUR", fontName=bold(SANS), fontSize=10, textAnchor="middle"))
    d.add(String(w * 0.7, h * 0.85, "CHAMBRE", fontName=bold(SANS), fontSize=10, textAnchor="middle"))
    d.add(String(w * 0.7, h * 0.25, "CUISINE / ENTRÉE", fontName=bold(SANS), fontSize=10, textAnchor="middle"))
    d.add(Rect(w * 0.9, 10, w * 0.07, 6, fillColor=colors.HexColor("#8A1C1C"), strokeColor=None))
    d.add(String(w * 0.9, 20, "porte palière", fontName=SANS, fontSize=7))
    d.add(Rect(w * 0.12, h * 0.35, w * 0.12, h * 0.12, fillColor=colors.HexColor("#DDDDDD"), strokeColor=stroke))
    d.add(String(w * 0.18, h * 0.39, "table basse", fontName=SANS, fontSize=7, textAnchor="middle"))
    d.add(String(w * 0.27, h * 0.25, "X", fontName=bold(SANS), fontSize=16, fillColor=colors.HexColor("#8A1C1C")))
    d.add(String(w * 0.29, h * 0.21, "position du corps", fontName=SANS, fontSize=7))
    d.add(Rect(w * 0.03, h * 0.62, w * 0.16, h * 0.08, fillColor=colors.HexColor("#CCCCCC"), strokeColor=stroke))
    d.add(String(w * 0.11, h * 0.64, "buffet", fontName=SANS, fontSize=7, textAnchor="middle"))
    d.add(String(w * 0.33, h * 0.55, "chaise renversée", fontName=SANS, fontSize=7))
    d.add(String(w * 0.5, 14, "Plan sommaire, non à l'échelle", fontName=SANS, fontSize=7, textAnchor="middle"))
    return d


# --------------------------------------------------------------------------------------
# Definition des pieces
# --------------------------------------------------------------------------------------
@dataclass
class Piece:
    cote: str
    filename: str
    nature: str
    date: str
    org: str
    build: Callable[[B], None]


PIECES: List[Piece] = []


def piece(cote, filename, nature, date, org):
    def deco(fn):
        PIECES.append(Piece(cote, filename, nature, date, org, fn))
        return fn
    return deco


AFFAIRE = "Homicide volontaire · victime : M. Gérard MARTIN · 14 rue des Glycines, bâtiment B, Valmont"


@piece("D01", "D01_Fiche_CIC_main_courante_informatisee.pdf", "Fiche d'intervention CIC (main courante informatisée)", "24/09/2026", "cic")
def d01(b: B):
    b.title("FICHE D'INTERVENTION", sub="Extrait de la main courante informatisée (MCI) du CIC")
    b.meta([("Date", "24/09/2026"), ("Nature de l'appel", "Différend de voisinage, bruit de chute, personne ne répondant plus"),
            ("Lieu", "14 rue des Glycines, bâtiment B, 3e étage, Valmont"), ("Requérante", "Mme Sylvie LEROY, 06 39 98 23 61 (appartement 22)"),
            ("Équipage engagé", "TV-12 (GPX Antoine ROUSSEL, GPX Inès KACI)"), ("Opérateur CIC", "Brigadier Yann CORRE")])
    b.table(["Horodatage", "Événement"], [
        ["22:47:38", "Appel 17 de Mme LEROY Sylvie : signale des cris puis un bruit de chute à l'étage supérieur, puis le silence. Le voisin du dessus, M. MARTIN, ne répond plus au téléphone."],
        ["22:48:10", "Engagement de l'équipage TV-12."],
        ["23:04:00", "TV-12 sur place."],
        ["23:09:25", "TV-12 demande le SAMU : homme inanimé, plaie à la tête, porte de l'appartement 32 entrouverte. Massage cardiaque en cours."],
        ["23:12:00", "Avis à l'OPJ de permanence, Brigade criminelle (Cne GARNIER)."],
        ["23:19:00", "SMUR sur place."],
        ["23:27:00", "Décès constaté par le Dr Paul HENRY (SMUR)."],
        ["23:38:00", "Arrivée OPJ Brigade criminelle (Cne GARNIER, Lt DELORME)."],
        ["23:52:00", "Arrivée de l'identité judiciaire (M. LECOMTE)."],
        ["00:40:00", "TV-12 relevé par l'équipage TV-07 pour la garde des lieux."],
    ], [3 * cm, 13.8 * cm])
    b.p("Extrait certifié conforme aux enregistrements de la main courante informatisée.", "small")
    b.sig("Le chef de salle du CIC", "Capitaine Éric VASSEUR")


@piece("D02", "D02_PV_intervention_police_secours.pdf", "Procès-verbal d'intervention (police-secours)", "24/09/2026", "ps")
def d02(b: B):
    b.title("PROCÈS-VERBAL", sub="Intervention · constatations initiales")
    b.meta([("Date et heure", "24/09/2026 à 22h48"), ("Affaire", AFFAIRE), ("Rédacteur", "Antoine ROUSSEL, Gardien de la paix, APJ"),
            ("Équipage", "TV-12 (GPX Antoine ROUSSEL, GPX Inès KACI)"), ("Cadre juridique", "Constatations, article 53 du code de procédure pénale")])
    b.p("L'an deux mille vingt-six, le vingt-quatre septembre à vingt-deux heures quarante-huit minutes, Nous, Antoine ROUSSEL, "
        "Gardien de la paix, agent de police judiciaire en résidence à Valmont, assisté de Inès KACI, Gardien de la paix, en patrouille "
        "à bord du véhicule sérigraphié indicatif TV-12, en tenue d'uniforme et porteurs de nos insignes,")
    b.p("Sommes requis par le CIC pour un différend de voisinage avec bruit de chute au 14 rue des Glycines, bâtiment B, Valmont. "
        "Nous transportons immédiatement sur les lieux où nous arrivons à 22h54.")
    b.p("Sur place, sommes accueillis au deuxième étage par Mme Sylvie LEROY, requérante, demeurant appartement 22, qui nous déclare spontanément : "
        "« J'ai entendu des cris vers 22h00 au-dessus de chez moi, chez M. MARTIN, puis un grand bruit. Je ne sais pas qui c'était. "
        "Depuis, il ne répond plus. »")
    b.p("Montons au troisième étage. Constatons que la porte de l'appartement 32, occupé par M. Gérard MARTIN, est entrouverte. "
        "Aucune trace apparente d'effraction n'est visible sur la serrure ni sur l'huisserie. Pénétrons dans les lieux en raison de l'urgence.")
    b.p("Découvrons dans le séjour un homme âgé, allongé sur le côté droit entre la table basse et le canapé, inconscient, présentant une plaie "
        "importante à l'arrière gauche du crâne et une flaque de sang sous la tête. La personne ne respire pas. Requérons immédiatement le SAMU "
        "et débutons un massage cardiaque jusqu'à l'arrivée du SMUR.")
    b.p("À 23h27, le Dr Paul HENRY, médecin du SMUR, constate le décès. Avisons le CIC et l'officier de police judiciaire de permanence. "
        "Gelons les lieux et interdisons l'accès à l'appartement 32 à toute personne.")
    b.p("À 23h35, procédons à une enquête de voisinage sommaire sur le palier du troisième étage.")
    b.p("Appartement 31 : frappons à la porte. Nous ouvre un homme se présentant comme M. Julien DUBOIS, vêtu d'un pyjama, qui déclare : "
        "« Je dormais, je n'ai rien entendu. » Relevons son identité. L'intéressé ne présente pas de blessure apparente aux mains. "
        "Il regagne son domicile.")
    b.p("Appartement 33 : M. Karim BENSAÏD indique être rentré à son domicile en fin de soirée et souhaiter s'entretenir avec les enquêteurs. "
        "Il est invité à se tenir à la disposition de l'officier de police judiciaire.")
    b.p("À 23h38, arrivée sur les lieux de l'officier de police judiciaire de permanence, Capitaine Hélène GARNIER, accompagnée du "
        "Lieutenant Marc DELORME, à qui nous rendons compte de nos diligences. Restons sur place pour la garde des lieux jusqu'à notre relève.")
    b.p("Dont procès-verbal, que nous clôturons le 25/09/2026 à 00h45.")
    b.sig("Le Gardien de la paix, APJ", "Antoine ROUSSEL", left="Le Gardien de la paix<br/>Inès KACI<br/><i>(signé)</i>")


@piece("D03", "D03_PV_transport_constatations.pdf", "Procès-verbal de transport, constatations et mesures prises", "24/09/2026", "police")
def d03(b: B):
    b.title("PROCÈS-VERBAL", sub="Transport, constatations et mesures prises")
    b.meta([("Date et heure", "24/09/2026 à 23h38, clôture le 25/09/2026 à 03h10"), ("Affaire", AFFAIRE),
            ("Rédacteur", "Lieutenant Marc DELORME, officier de police judiciaire"), ("Cadre juridique", "Enquête de flagrance, articles 53 et suivants du CPP")])
    b.p("L'an deux mille vingt-six, le vingt-quatre septembre à vingt-trois heures trente-huit minutes, Nous, Marc DELORME, Lieutenant de police, "
        "officier de police judiciaire en résidence à Valmont, en compagnie du Capitaine Hélène GARNIER, officier de police judiciaire, chef d'enquête,")
    b.p("Avisés par le CIC de la découverte d'un homme décédé au 14 rue des Glycines, nous transportons sur les lieux où nous arrivons à 23h38. "
        "Sommes accueillis par l'équipage TV-12 (GPX ROUSSEL et KACI) qui nous rend compte de ses diligences.")
    b.h("1. Description des lieux")
    b.p("L'immeuble, de quatre étages, constitue le bâtiment B de la résidence Les Glycines. L'accès principal se fait par la rue des Glycines, "
        "par un hall équipé d'une porte à digicode et lecteur de badge. Un accès secondaire existe par le parking souterrain, au moyen d'une porte "
        "métallique donnant sur la rampe située côté rue des Tanneurs. L'escalier dessert les étages ; l'ascenseur est hors service depuis le 20/09/2026 "
        "selon l'affichage du syndic.")
    b.p("Une caméra de vidéoprotection municipale, numérotée VP-112, est implantée à l'angle de la rue des Glycines et de l'avenue Jean-Jaurès, "
        "orientée vers l'entrée principale de l'immeuble. Requérons le centre de supervision urbain (CSU) de Valmont aux fins de conservation et "
        "d'extraction des images de la caméra VP-112 pour la journée du 24/09/2026 de 20h00 à 24h00.")
    b.p("Le palier du troisième étage dessert trois appartements : 31 (M. Julien DUBOIS), 32 (M. Gérard MARTIN) et 33 (M. Karim BENSAÏD). "
        "Les portes des appartements 31 et 32 sont contiguës.")
    b.h("2. Constatations dans l'appartement 32")
    b.p("La porte palière est entrouverte. La serrure ne présente aucune trace de forcement. L'appartement, de type T2, comprend une entrée-cuisine, "
        "un séjour et une chambre (plan sommaire en planche photographique, cote D04).")
    b.p("Dans le séjour, le corps d'un homme d'environ soixante-dix ans, identifié par les documents trouvés sur place comme étant M. Gérard MARTIN, "
        "né le 03/02/1959, repose sur le côté droit entre la table basse et le canapé. Une plaie du cuir chevelu est visible en région pariétale gauche. "
        "Une flaque de sang d'environ 40 cm de diamètre se trouve sous la tête. Des projections de sang sont visibles sur le pied de la table basse.")
    b.p("Une chaise est renversée. Un verre est brisé au sol près de la table basse. La table basse a été déplacée d'environ 30 cm selon les marques "
        "visibles sur le tapis. Le tiroir supérieur du buffet est ouvert ; il contient des papiers administratifs et ne contient aucune somme d'argent.")
    b.p("Aucune arme ni aucun objet contondant susceptible d'avoir provoqué la plaie n'est découvert dans l'appartement.")
    b.p("Le téléphone fixe de la victime est posé sur son socle. L'afficheur indique un appel manqué à 22h41 provenant du numéro de Mme LEROY.")
    b.h("3. Constatations sur le palier")
    b.p("Présence, sur le palier du troisième étage, devant la porte de l'appartement 32, d'une trace de semelle partielle imprégnée de sang, "
        "orientée vers l'escalier (relevé n°2). Le relevé n°2 est photographié et transmis au service régional d'identité judiciaire aux fins de comparaison.")
    b.h("4. Mesures prises")
    b.p("À 23h50, arrivée de M. Bruno LECOMTE, technicien de l'identité judiciaire, qui procède aux photographies des lieux (cote D04) et aux prélèvements.")
    b.p("Plaçons sous scellé n°1 le verre brisé et sous scellé n°2 un écouvillon de la flaque de sang du palier.")
    b.p("Avisons M. Olivier BRÉMOND, substitut du procureur de la République de permanence, qui se transporte sur les lieux à 00h30 et requiert "
        "un examen médico-légal du corps (autopsie) auprès de l'Institut médico-légal du CHU de Valmont.")
    b.p("À 00h10, M. Karim BENSAÏD, occupant de l'appartement 33, se présente à nous et déclare avoir aperçu M. Julien DUBOIS dans l'escalier dans "
        "la soirée. Il est invité à se présenter au service le 25/09/2026 pour y être entendu.")
    b.p("À 00h35, le Capitaine GARNIER procède à l'interpellation de M. Julien DUBOIS à son domicile (procès-verbal distinct, cote D08).")
    b.p("À 01h40, arrivée du Dr Isabelle CHARPENTIER, médecin légiste, qui procède à l'examen de levée de corps. Le corps est transporté à "
        "l'Institut médico-légal à 02h45.")
    b.p("Les lieux sont placés sous scellés à 03h05. Dont procès-verbal clos le 25/09/2026 à 03h10.")
    b.sig("Le Lieutenant de police, OPJ", "Marc DELORME")


@piece("D04", "D04_Planche_photographique_IJ.pdf", "Planche photographique et plan des lieux", "25/09/2026", "ij")
def d04(b: B):
    b.title("PLANCHE PHOTOGRAPHIQUE", sub="Constatations du 24/09/2026 · 14 rue des Glycines, bâtiment B")
    b.meta([("Opérateur", "M. Bruno LECOMTE, technicien de l'identité judiciaire"), ("Date des prises de vue", "24/09/2026 23h50 au 25/09/2026 02h30"),
            ("Procédure liée", "Procès-verbal de constatations (cote D03)")])
    photos = [
        ("Photo 1 : façade de l'immeuble, 14 rue des Glycines, vue depuis la chaussée.", "facade"),
        ("Photo 2 : caméra de vidéoprotection municipale VP-112, angle de l'avenue Jean-Jaurès.", "camera"),
        ("Photo 3 : palier du 3e étage, portes des appartements 31, 32 et 33.", "palier"),
        ("Photo 4 : porte de l'appartement 32, entrouverte, serrure intacte.", "porte"),
        ("Photo 5 : séjour de l'appartement 32, vue générale.", "sejour"),
        ("Photo 6 : position du corps (image non reproduite).", "corps"),
        ("Photo 7 : chaise renversée et verre brisé (scellé n°1).", "sejour"),
        ("Photo 8 : trace de semelle partielle imprégnée de sang sur le palier (relevé n°2), avec réglet.", "semelle"),
        ("Photo 9 : hall d'entrée du bâtiment B, vue vers l'accès au parking souterrain.", "hall"),
    ]
    for i, (cap, kind) in enumerate(photos):
        b.flow.append(KeepTogether([photo_frame(f"PHOTO {i + 1}", kind), Spacer(1, 3), Paragraph(cap, b.s["center"]), Spacer(1, 10)]))
    b.flow.append(KeepTogether([Paragraph("Plan sommaire de l'appartement 32", b.s["h"]), plan_appartement(),
                                Paragraph("Plan établi sur les lieux, non à l'échelle. La croix indique la position du corps à la découverte.", b.s["small"])]))
    b.sig("Le technicien de l'identité judiciaire", "Bruno LECOMTE")


def audition_header(b, date_heure, redacteur, qualite, identite_rows, opening):
    b.meta([("Date et heure", date_heure), ("Affaire", AFFAIRE), ("Rédacteur", redacteur), ("Qualité de la personne entendue", qualite)])
    b.p(opening)
    b.h("Identité")
    b.meta(identite_rows)


@piece("D05", "D05_PV_audition_temoin_LEROY.pdf", "Procès-verbal d'audition de témoin (Mme LEROY)", "25/09/2026", "police")
def d05(b: B):
    b.title("PROCÈS-VERBAL", sub="Audition de témoin · Mme Sylvie LEROY")
    audition_header(b, "25/09/2026 de 10h05 à 11h00", "Lieutenant Marc DELORME, OPJ", "Témoin",
                    [("Nom, prénom", "LEROY Sylvie, Marie"), ("Née le", "09/11/1967 à Valmont"), ("Profession", "Aide-soignante"),
                     ("Domicile", "14 rue des Glycines, bâtiment B, 2e étage, appartement 22, Valmont"), ("Téléphone", "06 39 98 23 61")],
                    "L'an deux mille vingt-six, le vingt-cinq septembre à dix heures cinq minutes, Nous, Marc DELORME, Lieutenant de police, "
                    "officier de police judiciaire, entendons la personne ci-après dénommée, qui, après avoir prêté serment de dire toute la vérité, "
                    "rien que la vérité, déclare :")
    b.h("Déclarations")
    b.p("J'habite l'appartement 22, juste en dessous de chez M. MARTIN, depuis 2011. Hier soir, jeudi, j'étais chez moi, seule, devant la télévision.")
    b.p("Vers 22h15, j'ai entendu une dispute au-dessus, chez M. MARTIN. C'étaient deux voix d'hommes qui criaient. Je pense avoir reconnu la voix de "
        "M. DUBOIS, le voisin de palier de M. MARTIN. Il a une voix grave et il parle fort ; je l'ai souvent entendu se disputer avec M. MARTIN "
        "dans l'escalier. Je n'ai pas compris les mots exacts.")
    b.p("Ensuite, vers 22h25, j'ai entendu un grand bruit sourd, comme quelque chose de lourd qui tombe, puis plus rien.")
    b.qa("Êtes-vous certaine de l'heure de la dispute ?",
         "À peu près. Mon émission avait commencé à 21h10 et c'était vers la fin de la première partie. Je dirais 22h15, à quelques minutes près.")
    b.qa("Êtes-vous certaine d'avoir reconnu la voix de M. DUBOIS ?",
         "Je pense que c'était lui. Je ne peux pas le jurer, mais ça ressemblait beaucoup à sa voix.")
    b.qa("Qu'avez-vous fait après avoir entendu ce bruit ?",
         "J'ai hésité. Vers 22h40, j'ai appelé M. MARTIN sur son téléphone fixe, il n'a pas répondu. Comme ce n'était pas normal, j'ai appelé la police au 17.")
    b.qa("Avez-vous vu quelqu'un dans l'escalier ou dans le hall ?",
         "Non. Je ne suis pas sortie de chez moi avant l'arrivée de la police.")
    b.qa("Connaissez-vous l'existence de différends entre M. MARTIN et M. DUBOIS ?",
         "Oui, tout l'immeuble le sait. Depuis l'année dernière, ils se disputent pour le bruit, parce que M. DUBOIS fait du bricolage le soir, et pour "
         "une histoire de dégât des eaux. Au mois de juin, M. MARTIN m'a dit qu'il était allé déposer une main courante au commissariat parce que "
         "M. DUBOIS l'avait menacé.")
    b.qa("M. MARTIN recevait-il des visites ?",
         "Sa fille venait le dimanche. Je ne connais pas ses autres fréquentations.")
    b.qa("Avez-vous autre chose à ajouter ?",
         "M. MARTIN était quelqu'un de gentil, un peu rigide. Je n'arrive pas à croire ce qui s'est passé.")
    b.p("Lecture faite par elle-même, Mme LEROY persiste et signe avec nous le présent procès-verbal à 11h00.")
    b.sig("Le Lieutenant de police, OPJ", "Marc DELORME", left="Le témoin<br/>Sylvie LEROY<br/><i>(signé)</i>")


@piece("D06", "D06_PV_audition_temoin_BENSAID.pdf", "Procès-verbal d'audition de témoin (M. BENSAÏD)", "25/09/2026", "police")
def d06(b: B):
    b.title("PROCÈS-VERBAL", sub="Audition de témoin · M. Karim BENSAÏD")
    audition_header(b, "25/09/2026 de 11h40 à 12h35", "Lieutenant Marc DELORME, OPJ", "Témoin",
                    [("Nom, prénom", "BENSAÏD Karim"), ("Né le", "21/04/1992 à Valmont"), ("Profession", "Agent de sécurité"),
                     ("Domicile", "14 rue des Glycines, bâtiment B, 3e étage, appartement 33, Valmont"), ("Téléphone", "06 39 98 61 74")],
                    "L'an deux mille vingt-six, le vingt-cinq septembre à onze heures quarante minutes, Nous, Marc DELORME, Lieutenant de police, "
                    "officier de police judiciaire, entendons la personne ci-après dénommée, qui, après avoir prêté serment de dire toute la vérité, "
                    "rien que la vérité, déclare :")
    b.h("Déclarations")
    b.p("Je suis agent de sécurité et je travaille en horaires décalés. Hier soir, jeudi 24 septembre, j'ai terminé mon service à 21h45 au centre "
        "commercial des Rives et je suis rentré chez moi à pied. Je suis arrivé à l'immeuble vers 22h25. Je suis entré par la porte principale avec "
        "mon badge. J'avais mon sac à dos.")
    b.p("Vers 22h30, je venais de rentrer chez moi et je suis ressorti sur le palier pour descendre mes poubelles. J'ai vu M. DUBOIS sur le palier "
        "du troisième étage. Il sortait de chez lui ou de chez M. MARTIN, je ne peux pas dire exactement, les deux portes sont côte à côte. "
        "Il descendait l'escalier rapidement. Il portait un sweat gris à capuche et il avait un sac de sport noir à la main. Il ne m'a pas dit "
        "bonsoir, alors que d'habitude il dit bonjour.")
    b.qa("Êtes-vous certain qu'il s'agissait de M. DUBOIS ?",
         "Oui. Je le croise tous les jours depuis trois ans. Je l'ai vu de profil puis de dos, la lumière du palier était allumée.")
    b.qa("Êtes-vous certain de l'heure ?",
         "Oui. J'ai regardé mon téléphone en rentrant, il était 22h26 quand j'ai fermé ma porte. Je suis ressorti quelques minutes après, donc vers 22h30.")
    b.qa("Avez-vous entendu une dispute ou un bruit particulier ?",
         "Non. J'avais mes écouteurs en rentrant. Je n'ai rien entendu de particulier.")
    b.qa("Avez-vous remarqué autre chose ?",
         "Je précise qu'il y a une caméra dans le hall d'entrée, au-dessus de la porte qui mène au parking. Le syndic l'a fait installer il y a "
         "environ deux mois, après des vols de vélos. Le gardien, M. Paul ROCHE, m'a dit que les images sont gardées quinze jours et qu'après elles s'effacent.")
    b.qa("Avez-vous autre chose à ajouter ?",
         "Je suis allé voir les policiers vers minuit pour leur dire ce que j'avais vu. Je n'ai pas de problème avec M. DUBOIS, je dis seulement ce que j'ai vu.")
    b.p("Lecture faite par lui-même, M. BENSAÏD persiste et signe avec nous le présent procès-verbal à 12h35.")
    b.sig("Le Lieutenant de police, OPJ", "Marc DELORME", left="Le témoin<br/>Karim BENSAÏD<br/><i>(signé)</i>")


@piece("D07", "D07_PV_audition_temoin_MARTIN_Claire.pdf", "Procès-verbal d'audition de témoin (Mme Claire MARTIN)", "25/09/2026", "police")
def d07(b: B):
    b.title("PROCÈS-VERBAL", sub="Audition de témoin · Mme Claire MARTIN")
    audition_header(b, "25/09/2026 de 15h30 à 16h20", "Brigadier-chef Sophie NAËL, APJ, agissant sous le contrôle du Capitaine GARNIER, OPJ",
                    "Témoin (fille de la victime)",
                    [("Nom, prénom", "MARTIN Claire, Élise"), ("Née le", "12/05/1988 à Valmont"), ("Profession", "Professeure des écoles"),
                     ("Domicile", "5 allée des Peupliers, Valmont"), ("Téléphone", "06 39 98 70 35")],
                    "L'an deux mille vingt-six, le vingt-cinq septembre à quinze heures trente minutes, Nous, Sophie NAËL, Brigadier-chef, "
                    "agent de police judiciaire, entendons la personne ci-après dénommée, qui, après avoir prêté serment, déclare :")
    b.h("Déclarations")
    b.p("Je suis la fille unique de Gérard MARTIN. Hier soir, je l'ai appelé vers 21h45 sur son téléphone fixe, comme presque tous les soirs. "
        "Nous avons parlé environ six minutes. Il allait bien mais il était énervé. Il m'a dit que le matin même, M. DUBOIS l'avait insulté et "
        "menacé dans l'escalier. Il m'a dit : « Un jour, ça va mal finir avec lui. »")
    b.qa("Votre père avait-il déjà signalé ces faits ?",
         "Oui, il avait déposé une main courante au commissariat au mois de juin, le 14 juin je crois. Il m'en avait donné une copie, que je vous remets.")
    b.p("Annexons au présent procès-verbal la copie de la main courante remise par Mme MARTIN (cote D24).")
    b.qa("Votre père avait-il d'autres conflits ?",
         "Non, à part avec M. DUBOIS. Il s'entendait bien avec Mme LEROY, qui l'aidait parfois pour les courses.")
    b.qa("Votre père gardait-il de l'argent ou des objets de valeur chez lui ?",
         "Un peu d'argent liquide dans le tiroir du buffet, peut-être 200 euros. Et sa montre, une montre en or qui venait de mon grand-père. "
         "Il la portait tout le temps, il ne l'enlevait jamais, même pour dormir.")
    b.qa("Votre père recevait-il des visites le soir ?",
         "Je ne crois pas. Il m'a parlé une ou deux fois d'un jeune homme qui l'aidait pour son ordinateur, mais je ne sais pas qui c'est.")
    b.qa("Avez-vous autre chose à ajouter ?", "Je veux comprendre ce qui s'est passé.")
    b.p("Lecture faite par elle-même, Mme MARTIN persiste et signe avec nous le présent procès-verbal à 16h20.")
    b.sig("Le Brigadier-chef, APJ", "Sophie NAËL", left="Le témoin<br/>Claire MARTIN<br/><i>(signé)</i>")


@piece("D08", "D08_PV_interpellation_notification_GAV.pdf", "PV d'interpellation et de notification de placement en garde à vue", "25/09/2026", "police")
def d08(b: B):
    b.title("PROCÈS-VERBAL", sub="Interpellation · placement en garde à vue · notification des droits")
    b.meta([("Date et heure", "25/09/2026 à 00h35"), ("Affaire", AFFAIRE), ("Rédacteur", "Capitaine Hélène GARNIER, OPJ, chef d'enquête"),
            ("Personne concernée", "M. Julien DUBOIS, né le 17/06/1985 à Valmont"), ("Cadre juridique", "Enquête de flagrance · articles 62-2, 63 et 63-1 du CPP")])
    b.p("L'an deux mille vingt-six, le vingt-cinq septembre à zéro heure trente-cinq minutes, Nous, Hélène GARNIER, Capitaine de police, officier de "
        "police judiciaire en résidence à Valmont,")
    b.p("Vu les constatations effectuées au 14 rue des Glycines et les déclarations de M. Karim BENSAÏD recueillies à 00h10 ; constatant qu'il existe "
        "à l'encontre de M. Julien DUBOIS une ou plusieurs raisons plausibles de soupçonner qu'il a commis ou tenté de commettre un crime,")
    b.p("Nous présentons au domicile de M. DUBOIS, appartement 31, et procédons à son interpellation à 00h35. L'intéressé ne fait aucune difficulté. "
        "Il est autorisé à s'habiller en notre présence.")
    b.p("Le conduisons au service, où nous arrivons à 01h05.")
    b.h("Notification du placement en garde à vue")
    b.p("À 01h10, notifions à M. Julien DUBOIS qu'il est placé en garde à vue à compter de 01h10, pour des faits de meurtre commis le 24/09/2026 à Valmont "
        "sur la personne de M. Gérard MARTIN, infraction prévue par l'article 221-1 du code pénal.")
    b.p("Lui notifions que la durée de la garde à vue est de vingt-quatre heures, soit jusqu'au 26/09/2026 à 01h10, et qu'elle pourra faire l'objet d'une "
        "prolongation de vingt-quatre heures sur autorisation écrite et motivée du procureur de la République.")
    b.h("Notification des droits (article 63-1 du CPP)")
    b.table(["Droit", "Réponse de la personne"], [
        ["Droit d'être assisté par un avocat", "Demande l'assistance de Me Laurent PEYRAT, avocat au barreau de Valmont, avisé à 01h20."],
        ["Droit d'être examiné par un médecin", "Demande un examen médical. Le Dr ROUX est requis à 01h22."],
        ["Droit de faire prévenir un proche et son employeur", "Demande que son frère, M. Thomas DUBOIS, soit prévenu. Avisé à 01h30."],
        ["Droit à un interprète", "Sans objet, l'intéressé parle et comprend le français."],
        ["Droit de se taire", "Notifié. L'intéressé déclare avoir compris."],
        ["Droit de consulter les pièces (art. 63-4-1)", "Notifié."],
    ], [6 * cm, 10.8 * cm])
    b.p("Avisons M. Olivier BRÉMOND, substitut du procureur de la République, du placement en garde à vue à 01h15.")
    b.p("Procédons, avec l'accord de l'intéressé, à un prélèvement biologique buccal aux fins de comparaison génétique, placé sous scellé DUBOIS-ADN.")
    b.p("Lecture faite, M. DUBOIS signe avec nous. Dont procès-verbal clos à 01h40.")
    b.sig("Le Capitaine de police, OPJ", "Hélène GARNIER", left="La personne gardée à vue<br/>Julien DUBOIS<br/><i>(signé)</i>")


@piece("D09", "D09_PV_audition_GAV1_DUBOIS.pdf", "Procès-verbal d'audition de personne gardée à vue n°1 (M. DUBOIS)", "25/09/2026", "police")
def d09(b: B):
    b.title("PROCÈS-VERBAL", sub="Audition de personne gardée à vue n°1 · M. Julien DUBOIS")
    audition_header(b, "25/09/2026 de 09h30 à 10h45", "Capitaine Hélène GARNIER, OPJ", "Personne gardée à vue, assistée de Me Laurent PEYRAT",
                    [("Nom, prénom", "DUBOIS Julien, Marc"), ("Né le", "17/06/1985 à Valmont"),
                     ("Profession", "Technicien de maintenance, SARL Thermo-Services Valmont (entreprise fictive)"), ("Situation familiale", "Célibataire, sans enfant"),
                     ("Domicile", "14 rue des Glycines, bâtiment B, 3e étage, appartement 31, Valmont"), ("Téléphone", "06 39 98 17 44")],
                    "L'an deux mille vingt-six, le vingt-cinq septembre à neuf heures trente minutes, Nous, Hélène GARNIER, Capitaine de police, "
                    "officier de police judiciaire, entendons la personne gardée à vue ci-après dénommée, en présence de son avocat. Rappel lui est fait "
                    "de son droit de faire des déclarations, de répondre aux questions ou de se taire. Il déclare vouloir répondre aux questions.")
    b.h("Déclarations")
    b.qa("Quelles étaient vos relations avec M. Gérard MARTIN ?",
         "Mauvaises. Il se plaignait sans arrêt du bruit. Je fais un peu de bricolage et il tapait au plafond, au mur. L'an dernier, il y a eu un dégât "
         "des eaux chez lui ; il disait que ça venait de chez moi, l'assurance a dit que non. Depuis, il me harcelait. On s'est disputés plusieurs fois "
         "dans l'escalier, oui.")
    b.qa("Avez-vous déjà menacé M. MARTIN ?",
         "Non. On s'est insultés, c'est tout. Je n'ai jamais menacé personne.")
    b.qa("Le 24/09/2026 au matin, vous êtes-vous disputé avec lui ?",
         "On s'est croisés dans l'escalier, il m'a fait une remarque, je lui ai dit de me laisser tranquille. Ça s'est arrêté là.")
    b.qa("Pouvez-vous nous indiquer votre emploi du temps le jeudi 24 septembre au soir ?",
         "Je suis rentré du travail vers 18h30, après être passé à la supérette. Je ne suis pas sorti de chez moi après 21h. J'ai mangé, j'ai regardé "
         "un peu la télévision et je me suis couché vers 21h30. J'avais pris un somnifère parce que je dors mal en ce moment. Je dormais quand les "
         "policiers ont frappé.")
    b.qa("Avez-vous utilisé votre téléphone portable dans la soirée ?",
         "J'ai envoyé un message à mon frère vers 21h. Après 21h, je n'ai plus touché à mon téléphone, il était en charge dans la cuisine.")
    b.qa("Avez-vous entendu une dispute ou des bruits chez M. MARTIN ?",
         "Non, rien. Je dormais. Et j'avais mis des bouchons d'oreille, comme tous les soirs.")
    b.qa("Êtes-vous allé chez M. MARTIN dans la soirée ?",
         "Non. Je ne l'ai pas vu de la soirée. Je ne suis pas allé chez lui.")
    b.qa("Possédez-vous un marteau ?",
         "Oui, j'ai une caisse à outils dans le cellier avec un marteau et des tournevis. C'est pour le bricolage.")
    b.qa("Possédez-vous un sweat gris à capuche ?", "Oui, j'en ai un, comme tout le monde.")
    b.qa("Possédez-vous un sac de sport noir ?", "J'en avais un. Je l'ai donné à mon frère il y a quelques mois, je crois.")
    b.qa("Avez-vous frappé M. MARTIN ?", "Non. Je n'ai rien fait.")
    b.p("Lecture faite par lui-même, M. DUBOIS persiste et signe avec nous et son avocat le présent procès-verbal à 10h45.")
    b.sig("Le Capitaine de police, OPJ", "Hélène GARNIER", left="La personne gardée à vue<br/>Julien DUBOIS<br/><i>(signé)</i><br/>L'avocat<br/>Me Laurent PEYRAT<br/><i>(signé)</i>")


@piece("D10", "D10_Autorisation_prolongation_GAV.pdf", "Autorisation de prolongation de garde à vue", "26/09/2026", "parquet")
def d10(b: B):
    b.title("AUTORISATION DE PROLONGATION", "DE GARDE À VUE", sub="Article 63, II du code de procédure pénale")
    b.p("Nous, Olivier BRÉMOND, substitut du procureur de la République près le tribunal judiciaire de Valmont,")
    b.p("Vu les articles 62-2, 63 et suivants du code de procédure pénale ;")
    b.p("Vu la procédure n° 2026/004127 diligentée par la Brigade criminelle de la Sûreté départementale de Valmont du chef de meurtre ;")
    b.p("Vu la mesure de garde à vue prise à l'encontre de M. Julien DUBOIS, né le 17/06/1985 à Valmont ;")
    b.p("Vu la présentation de l'intéressé par un moyen de télécommunication audiovisuelle ce jour à 00h40 ;")
    b.p("Attendu que les faits reprochés constituent un crime puni d'une peine d'emprisonnement supérieure ou égale à un an ; que la prolongation de "
        "la mesure constitue l'unique moyen de permettre l'exécution des investigations impliquant la présence de la personne, notamment l'exploitation "
        "des images de vidéoprotection et l'audition de témoins complémentaires, et d'empêcher toute concertation ou pression sur les témoins ;")
    b.p("<b>AUTORISONS</b> la prolongation de la garde à vue de M. Julien DUBOIS pour une durée de vingt-quatre heures à compter de l'expiration du délai initial.")
    b.p("Fait au parquet de Valmont, le 26 septembre 2026 à 00h50.")
    b.sig("Le substitut du procureur de la République", "Olivier BRÉMOND")
    b.sp(10)
    b.p("<b>Notification :</b> la présente autorisation a été notifiée à M. Julien DUBOIS le 26/09/2026 à 00h55 par le Capitaine Hélène GARNIER, OPJ.")


@piece("D11", "D11_PV_audition_GAV2_DUBOIS.pdf", "Procès-verbal d'audition de personne gardée à vue n°2 (M. DUBOIS)", "26/09/2026", "police")
def d11(b: B):
    b.title("PROCÈS-VERBAL", sub="Audition de personne gardée à vue n°2 · M. Julien DUBOIS")
    b.meta([("Date et heure", "26/09/2026 de 09h00 à 10h10"), ("Affaire", AFFAIRE), ("Rédacteur", "Lieutenant Marc DELORME, OPJ"),
            ("Qualité de la personne entendue", "Personne gardée à vue, assistée de Me Laurent PEYRAT")])
    b.p("L'an deux mille vingt-six, le vingt-six septembre à neuf heures, Nous, Marc DELORME, Lieutenant de police, officier de police judiciaire, "
        "poursuivant l'audition de M. Julien DUBOIS, déjà identifié, en présence de son avocat. Rappel lui est fait de son droit de se taire.")
    b.h("Déclarations")
    b.qa("M. BENSAÏD déclare vous avoir vu sur le palier vers 22h30, descendant l'escalier avec un sac de sport noir à la main. Qu'en dites-vous ?",
         "C'est faux. Il se trompe, ou il confond avec un autre jour. Je suis resté chez moi toute la soirée, je dormais.")
    b.qa("Mme LEROY déclare avoir entendu une dispute vers 22h15 chez M. MARTIN et pense avoir reconnu votre voix. Qu'en dites-vous ?",
         "Ce n'était pas moi. M. MARTIN recevait parfois du monde. Je ne sais pas avec qui il s'est disputé.")
    b.qa("Lors de la perquisition, un marteau a été découvert dans votre caisse à outils. Il présentait un aspect humide. Comment l'expliquez-vous ?",
         "Je l'ai nettoyé le week-end dernier, j'avais fait de la peinture. Je ne vois pas le problème.")
    b.qa("Une trace de semelle imprégnée de sang a été relevée sur le palier. Quelle est votre pointure ?",
         "Je fais du 43. Mais je ne suis pas sorti, je vous l'ai dit.")
    b.qa("Saviez-vous que M. MARTIN recevait des visites le soir ?",
         "Je l'ai vu parfois avec un homme plus jeune, brun, je ne sais pas qui c'est. La dernière fois, c'était la semaine dernière.")
    b.qa("Avez-vous quelque chose à ajouter ?", "Je n'ai rien fait. Je veux qu'on vérifie tout.")
    b.p("Lecture faite par lui-même, M. DUBOIS persiste et signe avec nous et son avocat le présent procès-verbal à 10h10.")
    b.sig("Le Lieutenant de police, OPJ", "Marc DELORME", left="La personne gardée à vue<br/>Julien DUBOIS<br/><i>(signé)</i><br/>L'avocat<br/>Me Laurent PEYRAT<br/><i>(signé)</i>")


@piece("D12", "D12_PV_perquisition_saisies.pdf", "Procès-verbal de perquisition et de saisies", "25/09/2026", "police")
def d12(b: B):
    b.title("PROCÈS-VERBAL", sub="Perquisition et saisies · domicile de M. Julien DUBOIS")
    b.meta([("Date et heure", "25/09/2026 de 14h10 à 15h20"), ("Affaire", AFFAIRE), ("Rédacteur", "Capitaine Hélène GARNIER, OPJ"),
            ("Lieu", "14 rue des Glycines, bâtiment B, 3e étage, appartement 31, et cellier n°31 au sous-sol"),
            ("Cadre juridique", "Enquête de flagrance · articles 56 et 57 du CPP · en présence constante de l'occupant gardé à vue")])
    b.p("L'an deux mille vingt-six, le vingt-cinq septembre à quatorze heures dix minutes, Nous, Hélène GARNIER, Capitaine de police, officier de police "
        "judiciaire, assistée du Lieutenant Marc DELORME et du Brigadier-chef Sophie NAËL, nous transportons au domicile de M. Julien DUBOIS, "
        "en présence constante de celui-ci, extrait de la geôle pour les besoins de la mesure.")
    b.h("Déroulement")
    b.p("L'appartement, de type T2, est en ordre. Dans la cuisine, un téléphone portable de marque Samsung, de couleur noire, est branché sur un chargeur "
        "posé sur le plan de travail.")
    b.p("Dans la chambre, sur une chaise, un sweat-shirt gris à capuche. Aucune tache n'est visible à l'œil nu.")
    b.p("Dans le cellier n°31 situé au sous-sol, une caisse à outils en plastique rouge contient notamment un marteau de menuisier à manche en bois et à tête "
        "métallique ronde d'environ 3 cm de diamètre. La tête et le manche présentent un aspect humide, comme récemment lavés.")
    b.p("Dans l'entrée, une paire de chaussures de sport (baskets) de couleur blanche, pointure 43.")
    b.p("Recherchons un sac de sport de couleur noire : aucun sac de ce type n'est découvert dans l'appartement ni dans le cellier.")
    b.p("Aucune montre, aucun bijou et aucune somme d'argent liquide significative ne sont découverts.")
    b.h("Saisies et placement sous scellés")
    b.table(["Scellé", "Description", "Lieu de découverte"], [
        ["Scellé n°3", "Téléphone portable Samsung noir, IMEI 35 492810 117384 2, avec carte SIM NEOTEL, ligne 06 39 98 17 44", "Cuisine, plan de travail"],
        ["Scellé n°4", "Sweat-shirt gris à capuche, taille L", "Chambre"],
        ["Scellé n°5", "Marteau de menuisier, manche bois, tête métallique ronde (diamètre environ 3 cm)", "Cellier n°31, caisse à outils"],
        ["Scellé n°6", "Paire de chaussures de sport blanches, pointure 43", "Entrée"],
    ], [2.4 * cm, 9.4 * cm, 5 * cm])
    b.p("Les opérations sont terminées à 15h20. Lecture faite, M. DUBOIS signe avec nous le présent procès-verbal et la liste des objets saisis.")
    b.sig("Le Capitaine de police, OPJ", "Hélène GARNIER", left="L'occupant des lieux<br/>Julien DUBOIS<br/><i>(signé)</i>")


@piece("D13", "D13_Rapport_autopsie.pdf", "Rapport médico-légal d'autopsie", "27/09/2026", "iml")
def d13(b: B):
    b.title("RAPPORT D'AUTOPSIE MÉDICO-LÉGALE", sub="Défunt : M. Gérard MARTIN, né le 03/02/1959")
    b.meta([("Requérant", "M. Olivier BRÉMOND, substitut du procureur de la République, réquisition du 25/09/2026"),
            ("Médecin légiste", "Dr Isabelle CHARPENTIER, praticien hospitalier, Institut médico-légal du CHU de Valmont"),
            ("Levée de corps", "25/09/2026 à 01h50, 14 rue des Glycines, bâtiment B, appartement 32"),
            ("Autopsie", "25/09/2026 à 14h00, Institut médico-légal"), ("Date du rapport", "27/09/2026")])
    b.h("1. Mission")
    b.p("Procéder à l'examen externe et à l'autopsie du corps de M. Gérard MARTIN ; décrire les lésions ; déterminer les causes et circonstances du décès ; "
        "préciser autant que possible l'heure de la mort ; effectuer tous prélèvements utiles à la manifestation de la vérité.")
    b.h("2. Commémoratifs")
    b.p("D'après les éléments communiqués par les enquêteurs, M. Gérard MARTIN, 67 ans, a été découvert inanimé à son domicile le 24/09/2026 en fin de soirée "
        "par les services de police. Le décès a été constaté par le médecin du SMUR à 23h27. Un différend de voisinage est signalé.")
    b.h("3. Examen de levée de corps")
    b.p("Examen pratiqué sur les lieux le 25/09/2026 à 01h50. Température rectale : 33,9 °C. Température ambiante de la pièce : 21 °C. Rigidité cadavérique "
        "débutante au niveau de la mâchoire, absente aux membres. Lividités rosées, débutantes, déclives, s'effaçant à la pression.")
    b.h("4. Examen externe")
    b.p("Sujet de sexe masculin, de corpulence normale, mesurant 1,72 m pour un poids de 78 kg. Aucun bijou ni montre n'est porté par le défunt. "
        "Les vêtements (chemise à carreaux, pantalon de toile, chaussons) sont imprégnés de sang au niveau du col et de l'épaule gauche.")
    b.p("Tête : plaie contuse de la région pariétale gauche, de forme circulaire, d'environ 3 cm de diamètre, à bords irréguliers et ecchymotiques. "
        "Seconde plaie contuse, linéaire, de 4 cm, en région occipitale droite.")
    b.p("Membres supérieurs : ecchymoses violacées de la face dorsale de la main droite et du tiers inférieur de l'avant-bras droit, mesurant respectivement "
        "3 x 2 cm et 5 x 3 cm. Éraflure de l'index droit.")
    b.p("Absence d'autre lésion traumatique récente. Absence de lésion évocatrice d'une contention ou d'une strangulation.")
    b.h("5. Examen interne")
    b.p("Crâne : fracture embarrure pariétale gauche, de forme arrondie, d'environ 3 cm de diamètre, avec enfoncement de la table interne. Hématome sous-dural "
        "aigu gauche d'environ 80 ml. Contusion cérébrale pariéto-temporale gauche. La plaie occipitale droite ne s'accompagne pas de fracture.")
    b.p("Thorax et abdomen : absence de lésion traumatique. Cœur de 390 g, athérome coronarien modéré, sans thrombose. Poumons congestifs. Estomac contenant "
        "environ 200 ml de bouillie alimentaire partiellement digérée.")
    b.h("6. Prélèvements")
    b.p("Des prélèvements sous-unguéaux des deux mains ont été réalisés. Ils ont été placés sous scellé n°7 et remis aux enquêteurs aux fins d'analyse génétique.")
    b.p("Des prélèvements sanguins (sang périphérique) et urinaires ont été réalisés et placés sous scellé n°8. Ils ont été adressés au laboratoire de "
        "toxicologie du CHU de Valmont. Les résultats des analyses toxicologiques seront communiqués dans un rapport complémentaire.")
    b.h("7. Discussion")
    b.p("La lésion pariétale gauche, associant une plaie contuse circulaire et une fracture embarrure de même diamètre, est caractéristique d'un impact appuyé "
        "par un objet contondant à surface de frappe plane et circulaire d'environ 3 cm de diamètre. L'aspect de la lésion est compatible avec un coup porté "
        "par un outil de type marteau, sans que cette compatibilité permette d'identifier l'objet utilisé.")
    b.p("La plaie occipitale droite, linéaire et sans fracture, est compatible avec une chute secondaire contre un plan dur à arête, tel que le rebord d'un "
        "meuble. Les ecchymoses de la main et de l'avant-bras droits sont compatibles avec des lésions de défense.")
    b.p("Compte tenu de la température rectale mesurée lors de la levée de corps, de la température ambiante, de l'état de la rigidité et des lividités, "
        "et en tenant compte des incertitudes propres à ces méthodes, le décès peut être situé entre 22h00 et 23h00 le 24/09/2026.")
    b.h("8. Conclusions")
    b.p("1) Le décès de M. Gérard MARTIN est consécutif à un traumatisme crânien grave avec fracture embarrure et hématome sous-dural aigu, provoqué par "
        "l'impact d'un objet contondant à surface de frappe circulaire d'environ 3 cm de diamètre.")
    b.p("2) Des lésions compatibles avec des gestes de défense sont présentes à la main et à l'avant-bras droits.")
    b.p("3) Le décès peut être situé entre 22h00 et 23h00 le 24/09/2026.")
    b.p("4) Des prélèvements sous-unguéaux (scellé n°7) et toxicologiques (scellé n°8) ont été réalisés. Les résultats toxicologiques feront l'objet d'un "
        "rapport complémentaire.")
    b.p("Je certifie avoir personnellement accompli la mission qui m'a été confiée et avoir donné mon avis en mon honneur et conscience.")
    b.sig("Fait à Valmont, le 27/09/2026", "Dr Isabelle CHARPENTIER, médecin légiste")


@piece("D14", "D14_PV_exploitation_videoprotection.pdf", "Procès-verbal d'exploitation de vidéoprotection (caméra VP-112)", "26/09/2026", "police")
def d14(b: B):
    b.title("PROCÈS-VERBAL", sub="Exploitation des images de vidéoprotection · caméra municipale VP-112")
    b.meta([("Date et heure", "26/09/2026 de 10h30 à 13h15"), ("Affaire", AFFAIRE), ("Rédacteur", "Brigadier-chef Sophie NAËL, APJ, sous le contrôle du Capitaine GARNIER"),
            ("Support", "Extraction remise par le CSU de Valmont le 25/09/2026 sur réquisition du 24/09/2026, fichier VP112_20260924_2000-2400.mp4"),
            ("Champ de la caméra", "Entrée principale du 14 rue des Glycines et trottoir attenant")])
    b.p("L'an deux mille vingt-six, le vingt-six septembre à dix heures trente minutes, Nous, Sophie NAËL, Brigadier-chef, agent de police judiciaire, "
        "procédons à l'exploitation du support susvisé. L'horodatage de l'enregistrement a été contrôlé par comparaison avec l'horloge parlante : il "
        "correspond à l'heure légale, sans décalage.")
    b.h("Passages relevés le 24/09/2026 entre 21h00 et 24h00")
    b.table(["Horodatage", "Observation"], [
        ["21:58:12", "Une silhouette entre dans l'immeuble par la porte principale. Vêtement sombre, capuche relevée, visage non visible. Corpulence moyenne. Ne porte pas de sac visible. Personne non identifiée."],
        ["22:24:40", "Un homme portant un sac à dos entre par la porte principale. Silhouette compatible avec la description de M. BENSAÏD, sans identification formelle."],
        ["22:41:05", "Une silhouette sort par la porte principale, vêtement sombre à capuche, tenant un sac à la main, et se dirige vers l'avenue Jean-Jaurès. Visage non visible. Personne non identifiée."],
        ["23:02:51", "Arrivée du véhicule sérigraphié de police-secours (indicatif TV-12 visible sur le toit) devant l'immeuble. Deux fonctionnaires entrent dans l'immeuble à 23:03:30."],
        ["23:17:44", "Arrivée du véhicule du SMUR."],
        ["23:36:10", "Arrivée d'un véhicule banalisé (OPJ Brigade criminelle)."],
    ], [3 * cm, 13.8 * cm])
    b.p("Entre 22:41:05 et 23:02:51, aucun passage piéton n'est observé par la porte principale. La silhouette entrée à 21:58:12 n'est pas observée "
        "ressortant par la porte principale avant 24h00, sauf à considérer qu'il s'agit de la silhouette sortie à 22:41:05, ce que la qualité des images "
        "ne permet ni d'établir ni d'exclure.")
    b.p("L'immeuble disposant d'un accès secondaire par le parking souterrain, non couvert par la caméra VP-112, des entrées ou sorties par cet accès ne "
        "peuvent être exclues.")
    b.h("Images extraites")
    b.flow.append(KeepTogether([cctv_frame("2026-09-24 21:58:12", "in"), Spacer(1, 3), Paragraph("Image 1 : entrée d'une silhouette non identifiée (21:58:12).", b.s["center"])]))
    b.sp(8)
    b.flow.append(KeepTogether([cctv_frame("2026-09-24 22:24:40", "backpack"), Spacer(1, 3), Paragraph("Image 2 : entrée d'un homme portant un sac à dos (22:24:40).", b.s["center"])]))
    b.sp(8)
    b.flow.append(KeepTogether([cctv_frame("2026-09-24 22:41:05", "out"), Spacer(1, 3), Paragraph("Image 3 : sortie d'une silhouette tenant un sac (22:41:05).", b.s["center"])]))
    b.sp(8)
    b.flow.append(KeepTogether([cctv_frame("2026-09-24 23:02:51", "car"), Spacer(1, 3), Paragraph("Image 4 : arrivée du véhicule TV-12 (23:02:51).", b.s["center"])]))
    b.p("Le support original est placé sous scellé n°9. Dont procès-verbal clos à 13h15.")
    b.sig("Le Brigadier-chef, APJ", "Sophie NAËL")


# ------------------------------- Fadettes -------------------------------------------
LIGNE_DUBOIS = "06 39 98 17 44"
THOMAS = "06 39 98 52 90"
CONTACTS = [(THOMAS, 6), ("06 39 98 41 27", 4), ("06 39 98 66 03", 3), ("06 39 98 13 58", 2), ("06 39 98 77 21", 2),
            ("06 39 98 30 09", 1), ("06 39 98 84 46", 1), ("04 65 71 20 18", 1), ("04 65 71 63 35", 1), ("06 39 98 95 12", 1)]
CELL_HOME, CELL_WORK, CELL_CENTRE, CELL_ZI = "20801-4417", "20801-5520", "20801-4102", "20801-5531"


def generate_fadettes():
    rng = random.Random(410)
    pool = [n for n, w in CONTACTS for _ in range(w)]
    rows = []
    start = datetime(2026, 7, 1)
    for day in range((datetime(2026, 9, 24) - start).days + 1):
        d = start + timedelta(days=day)
        weekend = d.weekday() >= 5
        n = rng.randint(14, 24)
        for _ in range(n):
            hour = rng.randint(7, 22) if not weekend else rng.randint(9, 23)
            t = d.replace(hour=min(hour, 23), minute=rng.randint(0, 59), second=rng.randint(0, 59))
            if d.month == 9 and d.day == 24 and t.hour >= 18:
                continue
            kind = rng.choices(["VOIX", "SMS", "DATA"], [45, 35, 20])[0]
            at_work = (not weekend) and 8 <= t.hour < 17
            cell = rng.choice([CELL_WORK, CELL_ZI]) if at_work else rng.choice([CELL_HOME, CELL_HOME, CELL_HOME, CELL_CENTRE])
            if kind == "DATA":
                rows.append((t, "DATA", "-", "-", f"{rng.randint(1, 48)},{rng.randint(0, 9)} Mo", cell))
            else:
                sens = rng.choice(["ENTRANT", "SORTANT"])
                corr = rng.choice(pool)
                dur = "-" if kind == "SMS" else f"00:{rng.randint(0, 11):02d}:{rng.randint(5, 59):02d}"
                rows.append((t, kind, sens, corr, dur, cell))
    fixed = [
        (datetime(2026, 9, 24, 18, 12, 5), "VOIX", "ENTRANT", "06 39 98 41 27", "00:03:22", CELL_HOME),
        (datetime(2026, 9, 24, 19, 2, 48), "DATA", "-", "-", "6,4 Mo", CELL_HOME),
        (datetime(2026, 9, 24, 20, 58, 31), "SMS", "SORTANT", THOMAS, "-", CELL_HOME),
        (datetime(2026, 9, 24, 21, 6, 2), "SMS", "ENTRANT", THOMAS, "-", CELL_HOME),
        (datetime(2026, 9, 24, 22, 10, 3), "DATA", "-", "-", "0,2 Mo", CELL_HOME),
        (datetime(2026, 9, 24, 22, 33, 17), "VOIX", "SORTANT", THOMAS, "00:00:52", CELL_HOME),
        (datetime(2026, 9, 24, 22, 35, 40), "SMS", "ENTRANT", THOMAS, "-", CELL_HOME),
        (datetime(2026, 9, 24, 23, 58, 12), "DATA", "-", "-", "1,1 Mo", CELL_HOME),
        (datetime(2026, 9, 25, 0, 21, 47), "DATA", "-", "-", "0,8 Mo", CELL_HOME),
    ]
    rows.extend(fixed)
    rows.sort(key=lambda r: r[0])
    return rows


@piece("D15", "D15_Releves_telephoniques_NEOTEL.pdf", "Réponse opérateur : relevés téléphoniques détaillés et cellules", "29/09/2026", "neotel")
def d15(b: B):
    b.title("RÉPONSE À RÉQUISITION JUDICIAIRE", sub="Relevé détaillé des communications (fadettes) et identification des cellules")
    b.meta([("Réquisition", "Réquisition judiciaire du 25/09/2026, Capitaine Hélène GARNIER, OPJ, Brigade criminelle de Valmont (article 60-1 du CPP)"),
            ("Ligne concernée", f"{LIGNE_DUBOIS} · titulaire de l'abonnement : M. Julien DUBOIS, 14 rue des Glycines, Valmont"),
            ("Période", "Du 01/07/2026 à 00h00 au 25/09/2026 à 06h00 (heure légale française)"),
            ("Date de la réponse", "29/09/2026"), ("Destinataire", "Brigade criminelle de Valmont, procédure n° 2026/004127")])
    b.h("Avertissements")
    b.p("Les horodatages correspondent à l'heure légale française. Les sessions de données (DATA) peuvent être déclenchées automatiquement par le terminal "
        "(synchronisation, notifications) sans action de l'utilisateur. La cellule indiquée est celle ayant pris en charge l'événement ; elle ne correspond "
        "pas à une localisation précise du terminal.")
    b.h("Identification des correspondants (annuaire, réponse partielle)")
    b.table(["Numéro", "Titulaire"], [
        [THOMAS, "M. Thomas DUBOIS"], ["06 39 98 41 27", "M. Hugo LEMAIRE"], ["06 39 98 66 03", "SARL Thermo-Services Valmont (ligne professionnelle)"],
        ["06 39 98 13 58", "Mme Laure DUBOIS"], ["Autres numéros", "Non communiqué (abonnés d'autres opérateurs)"],
    ], [5 * cm, 11.8 * cm])
    b.pb()
    b.h("Relevé détaillé des communications")
    rows = []
    for i, (t, kind, sens, corr, dur, cell) in enumerate(generate_fadettes(), 1):
        rows.append([str(i), t.strftime("%d/%m/%Y"), t.strftime("%H:%M:%S"), kind, sens, corr, dur, cell])
    b.table(["N°", "Date", "Heure", "Type", "Sens", "Correspondant", "Durée / volume", "Cellule"], rows,
            [1.1 * cm, 2.2 * cm, 1.9 * cm, 1.4 * cm, 2.1 * cm, 3.2 * cm, 2.4 * cm, 2.5 * cm], style="tiny", font_size=7.6)
    b.h("Identification des cellules")
    b.table(["Cellule", "Site", "Adresse du support", "Azimut", "Portée indicative"], [
        [CELL_HOME, "VALMONT-GLYCINES", "Toit, 22 avenue Jean-Jaurès, Valmont", "120°", "300 à 600 m (zone urbaine dense)"],
        [CELL_CENTRE, "VALMONT-CENTRE", "Pylône, place de la Mairie, Valmont", "240°", "400 à 800 m"],
        [CELL_WORK, "VALMONT-ZI-NORD", "Pylône, rue de l'Industrie, Valmont", "10°", "1 à 2 km"],
        [CELL_ZI, "VALMONT-ZI-EST", "Pylône, chemin des Forges, Valmont", "80°", "1 à 2 km"],
    ], [2.3 * cm, 3.9 * cm, 4.8 * cm, 1.5 * cm, 4.3 * cm])
    b.p("La cellule 20801-4417 couvre notamment la rue des Glycines, la rue des Tanneurs et l'avenue Jean-Jaurès. Une communication prise en charge par "
        "cette cellule ne permet pas de distinguer une présence à l'intérieur ou à l'extérieur d'un immeuble de ce secteur.")
    b.sig("Pour NEOTEL, le responsable du service des obligations légales", "Mme Corinne BLANC")


@piece("D16", "D16_Rapport_comparaison_traces_semelles.pdf", "Rapport de comparaison de traces de semelles", "30/09/2026", "srij")
def d16(b: B):
    b.title("RAPPORT D'EXAMEN TECHNIQUE", sub="Comparaison de traces de semelles")
    b.meta([("Saisine", "Demande du Capitaine GARNIER, OPJ, du 25/09/2026"), ("Technicien", "M. Damien FAURE, technicien en identification criminelle"),
            ("Éléments examinés", "Relevé n°2 (trace de semelle imprégnée de sang, palier du 3e étage) ; scellé n°6 (paire de chaussures de sport blanches, pointure 43)"),
            ("Date du rapport", "30/09/2026")])
    b.h("1. Examen du relevé n°2")
    b.p("Le relevé n°2 correspond à une empreinte partielle de la moitié avant d'une semelle droite, imprégnée de sang, présentant un motif à chevrons. "
        "La longueur exploitable est de 11 cm. Les bords sont flous sur la partie externe.")
    b.h("2. Examen du scellé n°6")
    b.p("La paire de chaussures présente une semelle à motif à chevrons. Aucune trace de sang n'est visible à l'œil nu ni sous éclairage rasant. "
        "La recherche de sang latent sur les semelles est négative.")
    b.h("3. Comparaison")
    b.p("Les caractéristiques de classe (motif à chevrons, dimensions compatibles avec une pointure comprise entre 42 et 44) sont concordantes. "
        "Aucune caractéristique individualisante (usure, coupure, défaut de fabrication) n'a pu être mise en évidence sur le relevé, trop partiel.")
    b.h("4. Conclusion")
    b.p("La chaussure droite du scellé n°6 ne peut être ni identifiée ni exclue comme étant à l'origine de la trace du relevé n°2. Le motif à chevrons "
        "est répandu sur ce type de chaussures de sport.")
    b.sig("Le technicien en identification criminelle", "Damien FAURE")


@piece("D17", "D17_Rapport_laboratoire_biologie.pdf", "Rapport du laboratoire de police scientifique (biologie)", "29/09/2026", "snps")
def d17(b: B):
    b.title("RAPPORT D'EXAMEN", sub="Recherche de traces biologiques")
    b.meta([("Demandeur", "Capitaine Hélène GARNIER, OPJ, Brigade criminelle de Valmont"),
            ("Objet", "Examen du scellé n°6 (marteau de menuisier) et du scellé n°4 (sweat-shirt gris) transmis le 26/09/2026"),
            ("Analyste", "Mme Nadia KHELIFI, ingénieure, section biologie"), ("Date du rapport", "29/09/2026")])
    b.h("1. Description des scellés reçus")
    b.p("Scellé n°6 : marteau de menuisier, manche en bois verni, tête métallique ronde de 3,1 cm de diamètre. Le scellé est reçu intact. "
        "L'objet présente des traces de nettoyage récent (dépôts calcaires, absence de poussière).")
    b.p("Scellé n°4 : sweat-shirt gris à capuche, taille L. Le scellé est reçu intact.")
    b.h("2. Examens réalisés sur le marteau (scellé n°6)")
    b.p("Examen visuel sous éclairage blanc et sous source lumineuse spécialisée : absence de tache visible.")
    b.p("Recherche de sang latent par réactif chimiluminescent : réaction positive faible au niveau de la jonction entre la tête et le manche, et dans "
        "une fissure longitudinale du manche. Réaction négative sur la face de frappe.")
    b.p("Prélèvements réalisés par écouvillonnage : P1 (jonction tête et manche), P2 (fissure du manche), P3 (face de frappe).")
    b.p("Conformément aux instructions reçues, les prélèvements P1 à P3 sont conservés et réservés pour analyse génétique, laquelle sera réalisée par "
        "l'expert désigné par le magistrat instructeur.")
    b.h("3. Examens réalisés sur le sweat-shirt (scellé n°4)")
    b.p("Examen visuel : absence de tache visible. Recherche de sang latent par réactif chimiluminescent : négative sur l'ensemble du vêtement.")
    b.h("4. Conclusion")
    b.p("Une réaction compatible avec la présence de sang a été mise en évidence sur le marteau (scellé n°6), au niveau de la jonction tête et manche et "
        "dans une fissure du manche. La nature humaine du sang et l'origine des traces ne peuvent être déterminées à ce stade. Aucune trace de sang n'a "
        "été mise en évidence sur le sweat-shirt (scellé n°4).")
    b.sig("L'ingénieure, section biologie", "Nadia KHELIFI")


@piece("D18", "D18_PV_transmission_scelle_telephone.pdf", "Procès-verbal de transmission de scellé (téléphone)", "29/09/2026", "police")
def d18(b: B):
    b.title("PROCÈS-VERBAL", sub="Transmission de scellé aux fins d'expertise technique")
    b.meta([("Date et heure", "29/09/2026 à 09h15"), ("Affaire", AFFAIRE), ("Rédacteur", "Lieutenant Marc DELORME, OPJ"),
            ("Cadre juridique", "Commission rogatoire de Mme VERGNE, juge d'instruction, en date du 28/09/2026 (cote D21)")])
    b.p("L'an deux mille vingt-six, le vingt-neuf septembre à neuf heures quinze minutes, Nous, Marc DELORME, Lieutenant de police, officier de police "
        "judiciaire, agissant en exécution de la commission rogatoire susvisée,")
    b.p("Transmettons le scellé n°3 (téléphone portable Samsung noir, IMEI 35 492810 117384 2, saisi au domicile de M. Julien DUBOIS) au Service national "
        "de police scientifique, section informatique et traces technologiques, aux fins d'extraction et d'exploitation des données : journal des appels, "
        "messages, applications de messagerie, données de géolocalisation et historique d'activité du terminal, pour la période du 24/09/2026 à 18h00 "
        "au 25/09/2026 à 01h00.")
    b.p("Le scellé est remis intact contre récépissé à 10h05. Le rapport d'extraction sera versé à la procédure dès réception.")
    b.p("Dont procès-verbal.")
    b.sig("Le Lieutenant de police, OPJ", "Marc DELORME")


@piece("D19", "D19_Requisitoire_introductif.pdf", "Réquisitoire introductif", "26/09/2026", "parquet")
def d19(b: B):
    b.title("RÉQUISITOIRE INTRODUCTIF")
    b.p("Le procureur de la République près le tribunal judiciaire de Valmont,")
    b.p("Vu les pièces de la procédure n° 2026/004127 établie par la Brigade criminelle de la Sûreté départementale de Valmont ;")
    b.p("Attendu qu'il en résulte contre M. Julien DUBOIS, né le 17/06/1985 à Valmont, des indices graves ou concordants rendant vraisemblable qu'il ait pu "
        "participer, comme auteur, à la commission des faits suivants : avoir, à Valmont, le 24 septembre 2026, volontairement donné la mort à M. Gérard MARTIN ; "
        "faits prévus et réprimés par les articles 221-1, 221-8 et 221-11 du code pénal ;")
    b.p("Vu les articles 80, 80-1 et 86 du code de procédure pénale ;")
    b.p("Requiert qu'il plaise à Mme ou M. le juge d'instruction informer contre M. Julien DUBOIS et contre tous autres que l'information fera connaître, "
        "procéder à son interrogatoire de première comparution aux fins de mise en examen, et saisir le juge des libertés et de la détention aux fins de "
        "placement en détention provisoire ;")
    b.p("Requiert en outre qu'il soit procédé à tous actes utiles à la manifestation de la vérité, notamment : l'exploitation complète de la téléphonie, "
        "l'expertise génétique des prélèvements réalisés, et l'enquête de personnalité de la personne mise en examen.")
    b.p("Fait au parquet, le 26 septembre 2026 à 16h30.")
    b.sig("Le substitut du procureur de la République", "Olivier BRÉMOND")


@piece("D20", "D20_PV_interrogatoire_premiere_comparution.pdf", "Procès-verbal d'interrogatoire de première comparution", "26/09/2026", "ji")
def d20(b: B):
    b.title("PROCÈS-VERBAL", "D'INTERROGATOIRE DE PREMIÈRE COMPARUTION", sub="Article 116 du code de procédure pénale")
    b.meta([("Date et heure", "26/09/2026 à 18h00"), ("Magistrat", "Mme Nathalie VERGNE, juge d'instruction"), ("Greffière", "Mme Laura PICHON"),
            ("Personne comparante", "M. Julien DUBOIS, né le 17/06/1985 à Valmont"), ("Avocat", "Me Laurent PEYRAT, avocat au barreau de Valmont, présent")])
    b.p("Devant Nous, Nathalie VERGNE, juge d'instruction au tribunal judiciaire de Valmont, assistée de Laura PICHON, greffière, a comparu M. Julien DUBOIS, "
        "déféré à l'issue de sa garde à vue, assisté de son avocat, qui a pu consulter le dossier et s'entretenir librement avec lui.")
    b.p("Avons fait connaître à la personne chacun des faits dont nous sommes saisis, à savoir avoir, à Valmont, le 24 septembre 2026, volontairement donné "
        "la mort à M. Gérard MARTIN, faits prévus par l'article 221-1 du code pénal, et l'avons informée de notre intention d'envisager sa mise en examen.")
    b.p("L'avons avisée de son droit, au choix, de se taire, de faire des déclarations ou de répondre aux questions.")
    b.p("La personne déclare : « Je veux m'expliquer. Je maintiens ce que j'ai dit aux policiers. Je suis resté chez moi toute la soirée, je dormais. "
        "Je n'ai pas tué M. MARTIN. On ne s'entendait pas, mais je ne lui aurais jamais fait de mal. »")
    b.p("Après avoir recueilli les observations de l'avocat, avons mis en examen M. Julien DUBOIS du chef de meurtre, l'avons informé des droits attachés "
        "à cette qualité, notamment du droit de formuler des demandes d'actes en application de l'article 82-1 du code de procédure pénale, et l'avons "
        "informé que le délai prévisible d'achèvement de l'information est de dix-huit mois.")
    b.p("Saisissons le juge des libertés et de la détention aux fins de placement en détention provisoire.")
    b.p("Lecture faite, la personne mise en examen signe avec nous, son avocat et la greffière.")
    b.sig("La juge d'instruction", "Nathalie VERGNE", left="La greffière<br/>Laura PICHON<br/><i>(signé)</i><br/>La personne mise en examen<br/>Julien DUBOIS<br/><i>(signé)</i>")


@piece("D21", "D21_Commission_rogatoire.pdf", "Commission rogatoire", "28/09/2026", "ji")
def d21(b: B):
    b.title("COMMISSION ROGATOIRE")
    b.p("Nous, Nathalie VERGNE, juge d'instruction au tribunal judiciaire de Valmont,")
    b.p("Vu l'information suivie contre M. Julien DUBOIS, mis en examen du chef de meurtre, et contre tous autres ;")
    b.p("Vu les articles 81, 151 et 152 du code de procédure pénale ;")
    b.p("Donnons commission rogatoire au chef de la Brigade criminelle de la Sûreté départementale de Valmont, aux fins de procéder à tous actes utiles à la "
        "manifestation de la vérité, et notamment :")
    for i, t in enumerate([
        "procéder à toutes auditions utiles, notamment de l'entourage de la victime et du voisinage ;",
        "exploiter la téléphonie de la personne mise en examen : relevés détaillés, cellules déclenchées, et extraction du téléphone saisi (scellé n°3) ;",
        "rechercher et exploiter tous enregistrements de vidéoprotection utiles ;",
        "recueillir le bulletin n°1 du casier judiciaire de la personne mise en examen ;",
        "identifier toute personne ayant fréquenté le domicile de la victime au cours des dernières semaines ;",
        "procéder à toutes réquisitions utiles.",
    ], 1):
        b.p(f"{i}) {t}", "quote")
    b.p("Disons que la présente commission rogatoire devra nous être retournée avant le 30/11/2026, accompagnée des procès-verbaux d'exécution.")
    b.p("Fait en notre cabinet, le 28 septembre 2026.")
    b.sig("La juge d'instruction", "Nathalie VERGNE")


@piece("D22", "D22_Ordonnance_commission_expert_ADN.pdf", "Ordonnance de commission d'expert (génétique)", "29/09/2026", "ji")
def d22(b: B):
    b.title("ORDONNANCE DE COMMISSION D'EXPERT")
    b.p("Nous, Nathalie VERGNE, juge d'instruction au tribunal judiciaire de Valmont,")
    b.p("Vu l'information suivie contre M. Julien DUBOIS, mis en examen du chef de meurtre ;")
    b.p("Vu les articles 156 et suivants du code de procédure pénale ;")
    b.p("Commettons en qualité d'expert le Dr Agathe VIDAL, expert inscrit sur la liste de la cour d'appel, laboratoire GENEXIS (laboratoire fictif), "
        "avec pour mission de :")
    for i, t in enumerate([
        "établir les profils génétiques susceptibles d'être obtenus à partir des prélèvements P1, P2 et P3 réalisés sur le marteau placé sous scellé n°5 ;",
        "établir les profils génétiques susceptibles d'être obtenus à partir des prélèvements sous-unguéaux de la victime placés sous scellé n°7 ;",
        "comparer les profils obtenus avec le profil génétique de la victime et avec celui de M. Julien DUBOIS (scellé DUBOIS-ADN) ;",
        "faire toutes observations utiles à la manifestation de la vérité.",
    ], 1):
        b.p(f"{i}) {t}", "quote")
    b.p("Disons que l'expert déposera son rapport avant le 30/10/2026.")
    b.p("Disons qu'une copie de la présente ordonnance sera adressée au procureur de la République et aux avocats des parties.")
    b.p("Fait en notre cabinet, le 29 septembre 2026.")
    b.sig("La juge d'instruction", "Nathalie VERGNE")


@piece("D23", "D23_Rapport_synthese_intermediaire.pdf", "Rapport de synthèse intermédiaire", "30/09/2026", "police")
def d23(b: B):
    b.title("RAPPORT DE SYNTHÈSE INTERMÉDIAIRE", sub="À l'attention de Mme Nathalie VERGNE, juge d'instruction")
    b.meta([("Date", "30/09/2026"), ("Affaire", AFFAIRE), ("Rédacteur", "Capitaine Hélène GARNIER, OPJ, chef d'enquête"),
            ("Cadre", "Enquête de flagrance du 24/09/2026 au 26/09/2026, puis commission rogatoire du 28/09/2026")])
    b.h("1. Rappel des faits")
    b.p("Le 24/09/2026 à 22h47, Mme Sylvie LEROY alertait le 17, signalant des cris et un bruit de chute dans l'appartement de son voisin du dessus, "
        "M. Gérard MARTIN, 67 ans. L'équipage TV-12 arrivait sur les lieux à 23h04 et découvrait M. MARTIN inanimé dans son séjour, présentant une plaie "
        "crânienne. Le décès était constaté à 23h27 par le médecin du SMUR.")
    b.p("Les premières auditions mettaient en évidence un conflit ancien entre la victime et son voisin de palier, M. Julien DUBOIS. M. Karim BENSAÏD "
        "déclarait avoir vu M. DUBOIS descendre l'escalier vers 22h30. M. DUBOIS était interpellé le 25/09/2026 à 00h35 et placé en garde à vue. "
        "Il contestait être sorti de son domicile dans la soirée.")
    b.h("2. Chronologie des actes")
    b.table(["Date", "Acte", "Cote"], [
        ["24/09/2026", "Intervention police-secours ; transport et constatations ; réquisition au CSU (caméra VP-112)", "D01 à D03"],
        ["25/09/2026", "Interpellation et placement en garde à vue de M. DUBOIS", "D08"],
        ["25/09/2026", "Auditions de Mme LEROY, M. BENSAÏD et Mme MARTIN", "D05 à D07"],
        ["25/09/2026", "Perquisition au domicile de M. DUBOIS ; saisie des scellés n°3 à n°6", "D12"],
        ["25/09/2026", "Autopsie (rapport du 27/09/2026)", "D13"],
        ["25/09/2026", "Réquisition à l'opérateur NEOTEL (fadettes et cellules)", "D15"],
        ["25/09/2026", "Demande du bulletin n°1 du casier judiciaire de M. DUBOIS", "non coté"],
        ["26/09/2026", "Prolongation de la garde à vue ; seconde audition de M. DUBOIS", "D10, D11"],
        ["26/09/2026", "Exploitation de la caméra VP-112", "D14"],
        ["26/09/2026", "Levée de la garde à vue à 15h00 et déferrement ; ouverture d'information ; mise en examen ; détention provisoire", "D19, D20, C01"],
        ["28/09/2026", "Commission rogatoire", "D21"],
        ["29/09/2026", "Transmission du téléphone (scellé n°3) au SNPS ; ordonnance d'expertise génétique", "D18, D22"],
    ], [2.6 * cm, 11.4 * cm, 2.8 * cm])
    b.h("3. État des investigations")
    b.p("Téléphonie : la réponse de l'opérateur NEOTEL a été reçue le 29/09/2026 (cote D15). Son exploitation détaillée est en cours. Le téléphone de "
        "M. DUBOIS (scellé n°3) a été transmis au SNPS le 29/09/2026 ; le rapport d'extraction est en attente.")
    b.p("Police technique et scientifique : la recherche de sang latent sur le marteau saisi est faiblement positive (cote D17) ; l'expertise génétique a "
        "été ordonnée le 29/09/2026. La comparaison de la trace de semelle avec les chaussures saisies est non concluante (cote D16).")
    b.p("Médecine légale : le rapport d'autopsie situe le décès entre 22h00 et 23h00 (cote D13). Les résultats toxicologiques restent attendus.")
    b.p("Antécédents : le bulletin n°1 du casier judiciaire de M. DUBOIS a été sollicité le 25/09/2026 auprès du casier judiciaire national ; la réponse "
        "n'est pas parvenue à ce jour.")
    b.p("Vidéoprotection : l'exploitation de la caméra municipale VP-112 fait apparaître trois passages non identifiés ou partiellement identifiés entre "
        "21h58 et 22h41 (cote D14).")
    b.h("4. Investigations restant à accomplir")
    b.p("Poursuite de l'exploitation de la téléphonie ; audition de M. Thomas DUBOIS ; identification des fréquentations récentes de la victime ; "
        "réception des rapports en attente.")
    b.sig("Le Capitaine de police, OPJ, chef d'enquête", "Hélène GARNIER")


@piece("D24", "D24_Copie_main_courante_14-06-2026.pdf", "Copie de main courante du 14/06/2026 (annexe à l'audition de Mme MARTIN)", "14/06/2026", "comm")
def d24(b: B):
    b.title("MAIN COURANTE", sub="Copie remise au déclarant")
    b.meta([("Date et heure", "14/06/2026 à 10h20"), ("Déclarant", "M. Gérard MARTIN, né le 03/02/1959, 14 rue des Glycines, bâtiment B, appartement 32, Valmont"),
            ("Agent", "Gardien de la paix Thomas GIRARD"), ("Nature", "Différend de voisinage, menaces verbales")])
    b.p("M. Gérard MARTIN déclare que, depuis plusieurs mois, son voisin de palier, M. Julien DUBOIS, fait du bruit tard le soir, notamment des travaux de "
        "bricolage. Le 13/06/2026 vers 20h00, dans l'escalier de l'immeuble, M. DUBOIS l'aurait insulté et lui aurait dit : « Un jour, je vais te faire taire. »")
    b.p("M. MARTIN précise ne pas souhaiter déposer plainte à ce stade et demande que ses déclarations soient consignées.")
    b.p("Mention portée à la main courante informatisée sous le numéro 2026/011873.")
    b.sig("Le Gardien de la paix", "Thomas GIRARD", left="Le déclarant<br/>Gérard MARTIN<br/><i>(signé)</i>")


@piece("C01", "C01_Ordonnance_placement_detention_provisoire.pdf", "Ordonnance de placement en détention provisoire", "26/09/2026", "jld")
def c01(b: B):
    b.title("ORDONNANCE DE PLACEMENT", "EN DÉTENTION PROVISOIRE", sub="Articles 137, 143-1, 144 et 145 du code de procédure pénale")
    b.p("Nous, François ADAM, juge des libertés et de la détention au tribunal judiciaire de Valmont,")
    b.p("Vu l'information suivie contre M. Julien DUBOIS, né le 17/06/1985 à Valmont, mis en examen le 26/09/2026 du chef de meurtre ;")
    b.p("Vu l'ordonnance de saisine du juge d'instruction et les réquisitions du ministère public ;")
    b.p("Après débat contradictoire tenu ce jour en cabinet, au cours duquel ont été entendus le ministère public, la personne mise en examen et son avocat, "
        "Me Laurent PEYRAT ;")
    b.p("Attendu que la détention provisoire constitue l'unique moyen : d'empêcher une pression sur les témoins, voisins immédiats de la personne mise en "
        "examen ; d'empêcher une concertation frauduleuse ; de conserver les preuves et indices matériels, dont l'exploitation est en cours ; de mettre fin "
        "au trouble exceptionnel et persistant à l'ordre public provoqué par la gravité de l'infraction ; et que ces objectifs ne sauraient être atteints "
        "par un placement sous contrôle judiciaire ou sous assignation à résidence avec surveillance électronique ;")
    b.p("<b>ORDONNONS</b> le placement en détention provisoire de M. Julien DUBOIS et décernons mandat de dépôt.")
    b.p("Disons que la présente ordonnance a été notifiée verbalement à la personne mise en examen, qui en a reçu copie intégrale, et qu'elle a été avisée "
        "de son droit de faire appel dans un délai de dix jours.")
    b.p("Fait en notre cabinet, le 26 septembre 2026 à 21h15.")
    b.sig("Le juge des libertés et de la détention", "François ADAM", left="La greffière<br/>Mélanie COSTE<br/><i>(signé)</i>")


@piece("C02", "C02_Demande_mise_en_liberte.pdf", "Demande de mise en liberté", "01/10/2026", "avocat")
def c02(b: B):
    b.p("Valmont, le 1er octobre 2026", "right")
    b.p("Madame Nathalie VERGNE<br/>Juge d'instruction, cabinet n°2<br/>Tribunal judiciaire de Valmont")
    b.sp(6)
    b.p("<b>Objet : demande de mise en liberté (article 148 du code de procédure pénale)</b><br/>Affaire : M. Julien DUBOIS · Instruction n° JI 26/00147")
    b.p("Madame la Juge,")
    b.p("J'ai l'honneur, au nom de M. Julien DUBOIS, mis en examen du chef de meurtre et placé en détention provisoire depuis le 26 septembre 2026, de "
        "solliciter sa mise en liberté, au besoin assortie d'un contrôle judiciaire.")
    b.p("M. DUBOIS dispose de garanties de représentation sérieuses : il occupe un emploi stable en contrat à durée indéterminée depuis 2014, n'a jamais "
        "quitté Valmont, et son frère, M. Thomas DUBOIS, propose de l'héberger à son domicile situé à quarante kilomètres, hors de la résidence où demeurent "
        "les témoins. M. DUBOIS s'engage à respecter toute interdiction d'entrer en contact avec les témoins et de paraître dans la résidence Les Glycines.")
    b.p("Les éléments recueillis à ce stade reposent pour l'essentiel sur des témoignages dont la fiabilité devra être éprouvée. Les investigations techniques "
        "(exploitation du téléphone, expertise génétique) sont en cours et la présence de M. DUBOIS en détention n'est pas nécessaire à leur bon déroulement.")
    b.p("Un contrôle judiciaire strict, comportant notamment une obligation de résider chez son frère, une interdiction de contact avec les témoins et une "
        "obligation de pointage, permettrait d'atteindre les objectifs de l'article 144 du code de procédure pénale.")
    b.p("Je vous prie d'agréer, Madame la Juge, l'expression de mon profond respect.")
    b.sig("Me Laurent PEYRAT", "Avocat de M. Julien DUBOIS")
    b.sp(14)
    b.stamp(["TRIBUNAL JUDICIAIRE DE VALMONT · CABINET N°2", "Reçue le 02/10/2026 à 10h40", "Communiquée au parquet le 02/10/2026 à 11h20",
             "La greffière : L. PICHON"])


@piece("C03", "C03_Demande_actes_art_82-1.pdf", "Demande d'actes (article 82-1 du CPP)", "29/09/2026", "avocat")
def c03(b: B):
    b.p("Valmont, le 29 septembre 2026", "right")
    b.p("Madame Nathalie VERGNE<br/>Juge d'instruction, cabinet n°2<br/>Tribunal judiciaire de Valmont")
    b.sp(6)
    b.p("<b>Objet : demande d'actes (article 82-1 du code de procédure pénale)</b><br/>Affaire : M. Julien DUBOIS · Instruction n° JI 26/00147")
    b.p("Madame la Juge,")
    b.p("Pour le compte de M. Julien DUBOIS, mis en examen, j'ai l'honneur de solliciter, par la présente demande écrite et motivée, qu'il soit procédé aux "
        "actes suivants :")
    b.p("1) l'audition de M. Thomas DUBOIS, frère de mon client, sur la personnalité de celui-ci et sur la remise du sac de sport noir évoqué par M. BENSAÏD ;", "quote")
    b.p("2) une confrontation entre M. Julien DUBOIS et Mme Sylvie LEROY, dont le témoignage repose sur une reconnaissance de voix à travers un plafond ;", "quote")
    b.p("3) l'identification de l'homme plus jeune qui rendait régulièrement visite à M. Gérard MARTIN, évoqué par mon client lors de sa garde à vue et par "
        "la fille de la victime.", "quote")
    b.p("Ces actes sont nécessaires à la manifestation de la vérité, l'information devant être conduite à charge et à décharge.")
    b.p("Je vous prie d'agréer, Madame la Juge, l'expression de mon profond respect.")
    b.sig("Me Laurent PEYRAT", "Avocat de M. Julien DUBOIS")
    b.sp(14)
    b.stamp(["TRIBUNAL JUDICIAIRE DE VALMONT · CABINET N°2", "Reçue le 30/09/2026 à 14h05", "La greffière : L. PICHON"])


# --------------------------------------------------------------------------------------
# Rendu : en-tete et pied de page avec numerotation par piece
# --------------------------------------------------------------------------------------
def make_canvas(pc: Piece):
    lines, ref, font = ORGS[pc.org]

    class PieceCanvas(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._pages = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self.chrome(total)
                super().showPage()
            super().save()

        def chrome(self, total):
            w, h = A4
            self.saveState()
            self.setFillColor(colors.HexColor("#1F2A44"))
            self.setFont(bold(font), 9)
            self.drawString(2 * cm, h - 1.35 * cm, lines[0])
            self.setFont(font, 8.5)
            y = h - 1.75 * cm
            for l in lines[1:]:
                if l:
                    self.drawString(2 * cm, y, l)
                    y -= 0.38 * cm
            self.setFont(font, 8.5)
            self.drawRightString(w - 2 * cm, h - 1.35 * cm, ref)
            self.setFont(bold(font), 10)
            self.drawRightString(w - 2 * cm, h - 1.8 * cm, f"Cote {pc.cote} · page {self._pageNumber}/{total}")
            self.setStrokeColor(colors.HexColor("#1F2A44"))
            self.setLineWidth(0.8)
            self.line(2 * cm, h - 2.75 * cm, w - 2 * cm, h - 2.75 * cm)
            self.setFont(font, 7)
            self.setFillColor(colors.HexColor("#8A8F99"))
            self.drawCentredString(w / 2, 1.1 * cm, FOOTER)
            self.restoreState()

    return PieceCanvas


def render_piece(pc: Piece, path: str):
    _, _, font = ORGS[pc.org]
    b = B(font)
    pc.build(b)
    doc = BaseDocTemplate(path, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=3.2 * cm, bottomMargin=2 * cm,
                          title=f"Cote {pc.cote} · {pc.nature}", author="Dossier fictif · Hackathon Sciences Po × Mistral AI",
                          subject="Affaire MARTIN / DUBOIS (fictive)")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="p", frames=[frame])])
    doc.build(b.flow, canvasmaker=make_canvas(pc))


def render_inventory(path, counts):
    s = styles_for(SERIF)
    flow = [Paragraph("TRIBUNAL JUDICIAIRE DE VALMONT", s["title"]), Paragraph("Cabinet n°2 · Mme Nathalie VERGNE, juge d'instruction", s["subtitle"]),
            Spacer(1, 10), Paragraph("DOSSIER D'INSTRUCTION N° JI 26/00147", s["title"]),
            Paragraph("Affaire : Ministère public et MARTIN (partie civile) contre DUBOIS Julien · Meurtre (art. 221-1 du code pénal)", s["center"]),
            Spacer(1, 6), Paragraph("Copie de travail · inventaire des pièces au 02/10/2026", s["subtitle"])]
    data = [[Paragraph("<b>Cote</b>", s["cell"]), Paragraph("<b>Nature de la pièce</b>", s["cell"]), Paragraph("<b>Date</b>", s["cell"]),
             Paragraph("<b>Pages</b>", s["cell"])]]
    for pc in PIECES:
        data.append([Paragraph(pc.cote, s["cell"]), Paragraph(pc.nature, s["cell"]), Paragraph(pc.date, s["cell"]), Paragraph(str(counts[pc.cote]), s["cell"])])
    t = Table(data, colWidths=[1.6 * cm, 11.2 * cm, 2.4 * cm, 1.6 * cm], repeatRows=1)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, colors.black), ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                           ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDE2EA")), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    flow += [t, Spacer(1, 10), Paragraph("Cotes D : fond. Cotes C : détention. Cotes B : personnalité (aucune pièce à ce jour).", s["small"]),
             Paragraph(FOOTER, s["small"])]
    doc = BaseDocTemplate(path, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
                          title="Inventaire · Dossier JI 26/00147 (fictif)")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height)])])
    doc.build(flow)


def main():
    from pypdf import PdfReader, PdfWriter
    os.makedirs(OUT_PIECES, exist_ok=True)
    counts, paths = {}, []
    for pc in PIECES:
        path = os.path.join(OUT_PIECES, pc.filename)
        render_piece(pc, path)
        counts[pc.cote] = len(PdfReader(path).pages)
        paths.append((pc, path))
        print(f"  {pc.cote}  {counts[pc.cote]:>2} p.  {pc.filename}")
    inv = os.path.join(HERE, "_inventaire.pdf")
    render_inventory(inv, counts)
    writer = PdfWriter()
    writer.append(inv, outline_item="Inventaire des pièces")
    for pc, path in paths:
        writer.append(path, outline_item=f"{pc.cote} · {pc.nature}")
    writer.add_metadata({"/Title": "Dossier JI 26/00147 · Affaire MARTIN / DUBOIS (fictif)", "/Author": "Hackathon Sciences Po × Mistral AI"})
    with open(OUT_BUNDLE, "wb") as f:
        writer.write(f)
    os.remove(inv)
    total = sum(counts.values()) + 1
    print(f"\n{len(PIECES)} pièces, {total} pages au total -> {OUT_BUNDLE}")


if __name__ == "__main__":
    main()
