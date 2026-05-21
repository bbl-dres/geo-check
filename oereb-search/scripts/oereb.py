### Request XML-Version of OEREB-Extracts ###

import requests
import xml.etree.ElementTree as ET
import csv
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# Change Base URL according to desired canton.
# Find List of URL's here: www.cadastre.ch/de/oereb-webservice
KANTON_URLS = {
    "AG": "https://api.geo.ag.ch/v2/oereb",
    "BE": "https://www.oereb2.apps.be.ch",
    "BL": "https://oereb.geo.bl.ch",
    "GR": "https://oereb.geo.gr.ch/oereb",
    "SO": "https://geo.so.ch/api/oereb",
    "TG": "https://map.geo.tg.ch/services/oereb",
    "ZH": "https://maps.zh.ch/oereb/v2",
    "BS": "https://api.oereb.bs.ch",
    "FR": "https://geo.fr.ch/RDPPF_ws/RdppfSVC.svc",
    "GE": "https://ge.ch/terecadastrews/RdppfSVC.svc",
    "JU": "https://geo.jura.ch/crdppf_server",
    "LU": "https://svc.geo.lu.ch/oereb",
    "NE": "https://sitn.ne.ch/crdppf",
    "NW": "https://oereb.gis-daten.ch/oereb",
    "OW": "https://oereb.gis-daten.ch/oereb",
    "SG": "https://oereb.geo.sg.ch/ktsg/wsgi/oereb",
    "SH": "https://oereb.geo.sh.ch",
    "SZ": "https://map.geo.sz.ch/oereb",
    "TI": "https://crdpp.geo.ti.ch/oereb2",
    "UR": "https://prozessor-oereb.ur.ch/oereb",
    "VD": "https://www.rdppf.vd.ch/ws/RdppfSVC.svc",
    "VS": "https://rdppf.apps.vs.ch",
    "ZG": "https://oereb.zg.ch/ors",
    "AI": "https://oereb.ai.ch/ktai/wsgi/oereb",
    "AR": "https://oereb.ar.ch/ktar/wsgi/oereb",
    "GL": "https://map.geo.gl.ch/oereb",
}


# Initialise parameters for XML request
def get_extract_xml(egrid, kanton):
    base_url = KANTON_URLS.get(kanton.upper())
    if not base_url:
        print(f"Kein URL für Kanton '{kanton}' hinterlegt.")
        return None

    url = f"{base_url}/extract/xml/"
    params = {
        "EGRID": egrid,
        "GEOMETRY": "false",
        "WITHIMAGES": "false"
    }

    response = requests.get(url, params=params, timeout=120)

    if response.status_code == 200:
        print("Erfolg")
        return response.text
    elif response.status_code == 204:
        print("Kein Grundstück gefunden")
    else:
        print("Fehler:", response.status_code)

    return None


# Insert relevant CSV-File with EGRID Numbers and Kanton here
input_rows = []
with open("egrids.csv", "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    print(reader.fieldnames)
    for row in reader:
        input_rows.append({"egrid": row["EGRID"], "kanton": row["Kanton"]})

ns_data = "http://schemas.geo.admin.ch/V_D/OeREB/2.0/ExtractData"
ergebnisse = []

for row in input_rows:
    egrid = row["egrid"]
    kanton = row["kanton"]
    print(f"Abfrage: {egrid} ({kanton})")
    xml_data = get_extract_xml(egrid, kanton)

    if xml_data:
        try:
            root = ET.fromstring(xml_data)
            area = root.find(f".//{{{ns_data}}}LandRegistryArea")
            flaeche = area.text if area is not None else "nicht gefunden"
        except ET.ParseError:
            flaeche = "XML-Fehler"
    else:
        flaeche = "Fehler bei Abfrage"

    ergebnisse.append({"EGRID": egrid, "Kanton": kanton, "Flaeche_m2": flaeche})

# Save in CSV-File
with open("grundstuecke.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["EGRID", "Kanton", "Flaeche_m2"])
    writer.writeheader()
    writer.writerows(ergebnisse)

print(f"\nGespeichert: grundstuecke.csv ({len(ergebnisse)} Einträge)")