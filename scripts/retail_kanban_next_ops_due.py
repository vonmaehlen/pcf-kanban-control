"""Kartenfeld „Nächstes Ops ToDo“ auf den Retail-Boards (Task 9, Umbau Aufgaben-Kategorien).

Ergänzt die Ansichten „Retail - Kanban“ und „Retail - Kanban - Abwicklung“ (opportunity) um
  - das Attribut cre56_next_ops_due (Verweis auf task, Betreff = Name des Verweises),
  - eine Verknüpfung auf task über cre56_next_ops_due mit ownerid und scheduledend (Fälligkeit),
  - drei Spalten direkt hinter cre56_next_due und
  - die Kartenfelder in der Kanban-Config aller Formfaktoren (hideWhenEmpty: leer, wenn kein Ops ToDo offen).
Auf der Karte steht die Zeile wie beim nächsten Vertriebs-ToDo: Besitzer-Symbol + Betreff. Der Betreff beginnt
schon mit dem Fälligkeitsdatum („13.11.2026 - …“, setzt das Plugin), deshalb ist scheduledend auf der Karte
ausgeblendet (bleibt in der Ansicht, z. B. zum Sortieren).
Co-Branding-Ansichten werden nicht angefasst.

    python3 scripts/retail_kanban_next_ops_due.py            # Trockenlauf: zeigt die Änderung, schreibt nichts
    python3 scripts/retail_kanban_next_ops_due.py --apply    # sichert, schreibt, veröffentlicht

Idempotent: eine Ansicht, die schon alles hat, bleibt unverändert. CRM-Zugang: claude-crm/prod/dv.py.
Voraussetzung: Kanban-Control ab 1.7.47 (kennt hideWhenEmpty; ältere zeigen „Label: -“).
"""
import datetime
import json
import re
import sys

import requests

sys.path.insert(0, "/Users/hagen/PycharmProjects/claude-crm/prod")
from dv import API, H, get  # noqa: E402

VIEWS = {
    "0e6fed8d-d42d-f111-88b4-7c1e52875821": "Retail - Kanban",
    "696e599d-5fd1-f111-a05a-7c1e5235ed23": "Retail - Kanban - Abwicklung",
}
BACKUP_DIR = "/Users/hagen/PycharmProjects/claude-crm/prod/backups"

FIELD = "cre56_next_ops_due"
ALIAS = "a_next_ops_due"
DUE = f"{ALIAS}.scheduledend"
OWNER = f"{ALIAS}.ownerid"
NEXT_DUE_TASK_OWNER = "a_c66099806c8349a18e63498da795a1a6.ownerid"
LINK = (f'<link-entity alias="{ALIAS}" name="task" to="{FIELD}" from="activityid" link-type="outer" visible="false">'
        '<attribute name="ownerid" /><attribute name="scheduledend" /></link-entity>')
CELLS = [(OWNER, 160), (FIELD, 166), (DUE, 120)]
CARD_FIELDS = {
    OWNER: {"hideLabel": True, "displayName": {"de": "Besitzer (Ops ToDo)", "en": "Owner (ops to-do)"},
            "width": 6, "persona": "iconOnly", "hideWhenEmpty": True},
    FIELD: {"displayName": {"de": "Nächstes Ops ToDo", "en": "Next ops to-do"}, "width": 94, "hideWhenEmpty": True},
    DUE: {"hidden": True},
}


def new_fetchxml(xml: str) -> str:
    if f'<attribute name="{FIELD}"' not in xml:
        xml = xml.replace('<attribute name="cre56_next_due" />',
                          f'<attribute name="cre56_next_due" /><attribute name="{FIELD}" />', 1)
    old = re.search(rf'<link-entity alias="{ALIAS}".*?</link-entity>', xml, re.S)
    if old and old.group(0) != LINK:
        xml = xml.replace(old.group(0), "")
    if f'alias="{ALIAS}"' not in xml:
        xml, n = re.subn(r"</entity>(\s*</fetch>\s*)$", LINK + r"</entity>\1", xml)
        assert n == 1, "Ende von <entity> nicht gefunden"
    assert f'<attribute name="{FIELD}" />' in xml and f'alias="{ALIAS}"' in xml, "fetchxml nicht ergänzt"
    return xml


def new_cells(layout: str) -> str:
    if re.findall(r'<cell name="([^"]+)"', layout).count(OWNER) and all(f'<cell name="{n}"' in layout for n, _ in CELLS):
        return layout
    layout = re.sub(rf'<cell name="(?:{"|".join(re.escape(n) for n, _ in CELLS)})"[^>]*/>', "", layout)
    missing = CELLS
    names = re.findall(r'<cell name="([^"]+)"', layout)
    anchors = [a for a in ("cre56_next_due", NEXT_DUE_TASK_OWNER) if a in names]
    assert anchors, "Spalte cre56_next_due fehlt in der Ansicht"
    anchor = max(anchors, key=names.index)  # hinter dem letzten der beiden next_due-Felder
    m = re.search(rf'<cell name="{re.escape(anchor)}"[^>]*/>', layout)
    assert m is not None
    insert = "".join(f'<cell name="{n}" width="{w}" />' for n, w in missing)
    return layout[:m.end()] + insert + layout[m.end():]


def new_config(cfg: dict) -> dict:
    fields = cfg.setdefault("card", {}).setdefault("fields", {})
    for name, settings in CARD_FIELDS.items():
        fields[name] = settings
    # Reihenfolge in card.fields: direkt hinter cre56_next_due (nur kosmetisch, Kartenreihenfolge = Spalten)
    if "cre56_next_due" in fields:
        ordered = {}
        for k, v in fields.items():
            if k in CARD_FIELDS:
                continue
            ordered[k] = v
            if k == "cre56_next_due":
                ordered.update({n: fields[n] for n in CARD_FIELDS})
        cfg["card"]["fields"] = ordered
    return cfg


def new_layoutxml(layout: str) -> str:
    layout = new_cells(layout)

    def repl(m):
        cfg = json.loads(m.group(2))
        return m.group(1) + json.dumps(new_config(cfg), ensure_ascii=False, indent=1) + m.group(3)

    out, n = re.subn(r"(<config[^>]*>)(.*?)(</config>)", repl, layout, flags=re.S)
    assert n >= 1, "keine Kanban-Config in der Ansicht"
    return out


def main():
    apply = "--apply" in sys.argv
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    changes = {}
    for vid, name in VIEWS.items():
        v = get(f"/savedqueries({vid})?$select=name,fetchxml,layoutxml,returnedtypecode")
        assert v["name"] == name and v["returnedtypecode"] == "opportunity", (vid, v["name"])
        fx, lx = new_fetchxml(v["fetchxml"]), new_layoutxml(v["layoutxml"])
        if fx == v["fetchxml"] and lx == v["layoutxml"]:
            print(f"{name}: schon aktuell, nichts zu tun")
            continue
        # Probe: die neue Abfrage muss laufen
        r = requests.get(f"{API}/opportunities", params={"fetchXml": fx}, headers=H)
        r.raise_for_status()
        rows = r.json()["value"]
        with_ops = [x for x in rows if x.get(f"_{FIELD}_value")]
        print(f"{name}: Treffer {len(rows)}, davon mit offenem Ops ToDo {len(with_ops)}")
        for x in with_ops[:5]:
            print("   ", x.get("name"), "|", x.get(f"_{FIELD}_value@OData.Community.Display.V1.FormattedValue"),
                  "|", x.get(f"{DUE}@OData.Community.Display.V1.FormattedValue"))
        print("    Spalten:", re.findall(r'<cell name="([^"]+)"', lx))
        changes[vid] = (v, fx, lx)
    if not changes:
        return
    if not apply:
        print("Trockenlauf. Mit --apply sichern und schreiben.")
        return
    backup = f"{BACKUP_DIR}/retail_kanban_next_ops_due_{stamp}.json"
    with open(backup, "w") as f:
        json.dump({vid: {k: v[k] for k in ("name", "fetchxml", "layoutxml")} for vid, (v, _, _) in changes.items()},
                  f, ensure_ascii=False, indent=1)
    print("Sicherung:", backup)
    for vid, (v, fx, lx) in changes.items():
        r = requests.patch(f"{API}/savedqueries({vid})", headers={**H, "Content-Type": "application/json"},
                           json={"fetchxml": fx, "layoutxml": lx})
        r.raise_for_status()
        print("geschrieben:", v["name"])
    requests.post(f"{API}/PublishXml", headers={**H, "Content-Type": "application/json"},
                  json={"ParameterXml": "<importexportxml><entities><entity>opportunity</entity></entities>"
                                        "</importexportxml>"}).raise_for_status()
    print("veröffentlicht")


if __name__ == "__main__":
    main()
