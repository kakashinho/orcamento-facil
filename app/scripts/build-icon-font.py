"""
Gera as fontes de ícones do app a partir da fonte variável Material Symbols Rounded (Google).

- Lê os nomes em src/ui/icons/icon-names.ts;
- cria duas instâncias estáticas (FILL=0 contorno e FILL=1 preenchido; wght=400, GRAD=0, opsz=24),
  iguais às variações usadas no protótipo (classes .msym e .msym.fill);
- mantém só os ícones usados (a fonte completa tem ~15 MB; as reduzidas, poucos KB);
- escreve assets/fonts/MaterialSymbolsRounded*.ttf e src/ui/icons/glyph-map.json.

Uso: python scripts/build-icon-font.py [pasta-com-a-fonte-variavel]
Requer: pip install fonttools
A fonte variável e o arquivo .codepoints são baixados de
https://github.com/google/material-design-icons/tree/master/variablefont se não forem informados.
"""
import json
import os
import re
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "https://github.com/google/material-design-icons/raw/master/variablefont/"
FONT_FILE = "MaterialSymbolsRounded[FILL,GRAD,opsz,wght]"


def source_files(folder):
    font = os.path.join(folder, "rounded.ttf")
    codepoints = os.path.join(folder, "rounded.codepoints")
    if not os.path.exists(font):
        quoted = urllib.request.quote(FONT_FILE)
        urllib.request.urlretrieve(BASE_URL + quoted + ".ttf", font)
        urllib.request.urlretrieve(BASE_URL + quoted + ".codepoints", codepoints)
    return font, codepoints


def icon_names():
    with open(os.path.join(ROOT, "src", "ui", "icons", "icon-names.ts"), encoding="utf-8") as f:
        block = f.read().split("ICON_NAMES = [", 1)[1].split("]", 1)[0]
    return re.findall(r'"([a-z0-9_]+)"', block)


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".icon-cache")
    os.makedirs(folder, exist_ok=True)
    font_path, codepoints_path = source_files(folder)

    codepoints = {}
    with open(codepoints_path, encoding="utf-8") as f:
        for line in f:
            name, hex_code = line.split()
            codepoints.setdefault(name, int(hex_code, 16))

    names = icon_names()
    missing = [n for n in names if n not in codepoints]
    if missing:
        sys.exit("Ícones inexistentes na Material Symbols: " + ", ".join(missing))
    glyph_map = {n: codepoints[n] for n in names}

    for fill, suffix in ((0, ""), (1, "Filled")):
        font = TTFont(font_path)
        static = instancer.instantiateVariableFont(font, {"FILL": fill, "wght": 400, "GRAD": 0, "opsz": 24})
        options = subset.Options()
        options.layout_features = []
        options.name_IDs = ["*"]
        options.notdef_outline = True
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=sorted(set(glyph_map.values())))
        subsetter.subset(static)
        family = "MaterialSymbolsRounded" + suffix
        for record in static["name"].names:
            if record.nameID in (1, 4, 6, 16):
                record.string = family
        out = os.path.join(ROOT, "assets", "fonts", family + ".ttf")
        static.save(out)
        print(f"{out}: {os.path.getsize(out)} bytes")

    with open(os.path.join(ROOT, "src", "ui", "icons", "glyph-map.json"), "w", encoding="utf-8") as f:
        json.dump(glyph_map, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"{len(glyph_map)} ícones")


if __name__ == "__main__":
    main()
