// Pure-SVG 7-segment display (no icon/font dependencies).
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [2.2, 0.6, 7.6, 1.9],
  b: [9.5, 2.3, 1.9, 7.2],
  c: [9.5, 10.5, 1.9, 7.2],
  d: [2.2, 17.5, 7.6, 1.9],
  e: [0.6, 10.5, 1.9, 7.2],
  f: [0.6, 2.3, 1.9, 7.2],
  g: [2.2, 9.05, 7.6, 1.9],
};
const DIGITS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  ' ': '',
};

interface Props {
  value: number;
  digits?: number;
  height?: number;
  color?: string;
}

export default function SevenSegment({ value, digits = 6, height = 40, color = '#ffc94a' }: Props) {
  const raw = Math.max(0, Math.floor(value)).toString();
  const shown = raw.length > digits ? raw.slice(-digits) : raw.padStart(digits, ' ');
  const w = (height / 20) * 12;
  return (
    <div className="flex items-end gap-[3px]" aria-label={`${value} transistors`}>
      {shown.split('').map((ch, i) => {
        const lit = DIGITS[ch] ?? '';
        const fromRight = digits - i;
        const comma = fromRight % 3 === 1 && fromRight > 1 && shown[i] !== ' ' ;
        return (
          <div key={i} className="flex items-end">
            <svg width={w} height={height} viewBox="0 0 12 20">
              {Object.entries(SEGMENTS).map(([seg, [x, y, sw, sh]]) => {
                const on = lit.includes(seg);
                return (
                  <rect
                    key={seg}
                    x={x}
                    y={y}
                    width={sw}
                    height={sh}
                    rx={0.5}
                    fill={on ? color : '#2a2410'}
                    style={on ? { filter: `drop-shadow(0 0 1.5px ${color})` } : undefined}
                  />
                );
              })}
            </svg>
            {comma && <span className="mb-[-2px] ml-[2px] h-[5px] w-[4px] rounded-sm" style={{ background: color }} />}
          </div>
        );
      })}
    </div>
  );
}
