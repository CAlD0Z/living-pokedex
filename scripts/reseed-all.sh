#!/bin/sh
set -e
GROUPS="RBY FRLG GSC RSE DPPT HGSS BW BW2 XY ORAS SM USUM LGPE SwSh IoA CT BDSP PLA SV Kita BB"
for g in $GROUPS; do
  echo "=== Seeding $g ==="
  node "$(dirname "$0")/seed-encounters.js" --game-group $g
  echo "=== Done $g ==="
done
echo "=== ALL DONE ==="
