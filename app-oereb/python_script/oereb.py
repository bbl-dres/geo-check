### Request XML-Version of OEREB-Extracts ###

import requests
import xml.etree.ElementTree as ET
import csv


# Change Base URL according to desired canton.
# Find List of URL's here: www.cadastre.ch/de/oereb-webservice
BASE_URL = "https://www.oereb2.apps.be.ch"

# Initialise parameters for XML request
def get_extract_xml(egrid):
    url = f"{BASE_URL}/extract/xml/"

    params = {
        "EGRID": egrid,
        "LANG": "de",
        "GEOMETRY": "true",
        "WITHIMAGES": "false"
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        print("Erfolg")
        return response.text
    elif response.status_code == 204:
        print("Kein Grundstück gefunden")
    else:
        print("Fehler:", response.status_code)

    return None

# Insert relevant CSV-File with EGRID Numbers of Area here
input_egrids = []
with open("egrids.csv", "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    print(reader.fieldnames)
    for row in reader:
        input_egrids.append(row["\ufeffEGRID"])

ns_data = "http://schemas.geo.admin.ch/V_D/OeREB/2.0/ExtractData"
ergebnisse = []

for egrid in input_egrids:
    print(f"Abfrage: {egrid}")
    xml_data = get_extract_xml(egrid)

    if xml_data:
        root = ET.fromstring(xml_data)
        area = root.find(f".//{{{ns_data}}}LandRegistryArea")
        flaeche = area.text if area is not None else "nicht gefunden"
    else:
        flaeche = "Fehler bei Abfrage"

    ergebnisse.append({"EGRID": egrid, "Flaeche_m2": flaeche})

# Save in CSV-File
with open("grundstuecke.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["EGRID", "Flaeche_m2"])
    writer.writeheader()
    writer.writerows(ergebnisse)

print(f"\nGespeichert: grundstuecke.csv ({len(ergebnisse)} Einträge)")