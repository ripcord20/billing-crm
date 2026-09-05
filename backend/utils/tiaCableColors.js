'use strict';

/** 12 warna dasar TIA/EIA-598 (urutan core 1–12, berulang tiap tube). */
const TIA_COLOR_PALETTE = [
  { name: 'Blue',   hex: '#0000FF', label: 'Biru' },
  { name: 'Orange', hex: '#FF6600', label: 'Oranye' },
  { name: 'Green',  hex: '#008000', label: 'Hijau' },
  { name: 'Brown',  hex: '#8B4513', label: 'Cokelat' },
  { name: 'Slate',  hex: '#808080', label: 'Abu-abu' },
  { name: 'White',  hex: '#FFFFFF', label: 'Putih' },
  { name: 'Red',    hex: '#FF0000', label: 'Merah' },
  { name: 'Black',  hex: '#000000', label: 'Hitam' },
  { name: 'Yellow', hex: '#FFFF00', label: 'Kuning' },
  { name: 'Violet', hex: '#800080', label: 'Ungu' },
  { name: 'Rose',   hex: '#FFC0CB', label: 'Pink' },
  { name: 'Aqua',   hex: '#00FFFF', label: 'Toska' }
];

const ALLOWED_CORE_COUNTS = [1, 2, 4, 8, 12, 24, 48];

function describeCore(coreNum) {
  const n = Number(coreNum);
  const coreColor = TIA_COLOR_PALETTE[(n - 1) % 12];
  const tubeIndex = Math.floor((n - 1) / 12);
  const tubeColor = TIA_COLOR_PALETTE[tubeIndex] || TIA_COLOR_PALETTE[0];
  return {
    core_number: n,
    tube_number: tubeIndex + 1,
    tube_color: tubeColor.name,
    color_code: coreColor.name,
    hex_code: coreColor.hex,
    label: `Tube ${tubeIndex + 1} (${tubeColor.label}) · Core ${n} (${coreColor.label})`
  };
}

function generateCableCores(cableId, totalCores) {
  const total = Number(totalCores);
  if (!ALLOWED_CORE_COUNTS.includes(total)) {
    throw new Error('Kapasitas core harus 1, 2, 4, 8, 12, 24, atau 48.');
  }
  const rows = [];
  for (let coreNum = 1; coreNum <= total; coreNum++) {
    const desc = describeCore(coreNum);
    rows.push({
      cable_id: cableId,
      core_number: desc.core_number,
      tube_number: desc.tube_number,
      tube_color: desc.tube_color,
      color_code: desc.color_code,
      hex_code: desc.hex_code,
      status: 'idle'
    });
  }
  return rows;
}

module.exports = {
  TIA_COLOR_PALETTE,
  ALLOWED_CORE_COUNTS,
  describeCore,
  generateCableCores
};
