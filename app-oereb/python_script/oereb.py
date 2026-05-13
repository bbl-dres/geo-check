### Request XML-Version of OEREB-Extracts ###

import requests


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

# Insert relevant EGRID Number of Area here
xml_data = get_extract_xml("CH761346357379")

# Save XML-File
if xml_data:
    with open("extract.xml", "w", encoding="utf-8") as f:
        f.write(xml_data)
