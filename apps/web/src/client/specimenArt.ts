/** Original specimen drawings for the Studio sample. They are not project references. */
function svgUri(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export const northStairArt = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#9aafc0"/>
  <ellipse cx="980" cy="40" rx="460" ry="280" fill="#f3e2c4"/>
  <rect y="500" width="1200" height="400" fill="#7d8b98"/>
  <g fill="#dcc9a8">
    <polygon points="30,800 1170,760 1120,820 80,860"/>
    <polygon points="70,700 1130,650 1170,760 30,800"/>
    <polygon points="120,600 1070,545 1130,650 70,700"/>
    <polygon points="180,510 1000,455 1070,545 120,600"/>
  </g>
  <g fill="#5c5344">
    <polygon points="180,510 1000,455 960,472 200,524"/>
    <polygon points="120,600 1070,545 1030,562 150,614"/>
  </g>
  <rect y="860" width="1200" height="40" fill="#5d6a76"/>
</svg>`);

export const harborArt = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#d7e3e8"/>
  <rect y="420" width="1200" height="480" fill="#6d92a4"/>
  <rect y="420" width="1200" height="28" fill="#e7eef1"/>
  <polygon points="160,640 820,560 960,720 90,790" fill="#c65b3c"/>
  <polygon points="160,640 820,560 790,520 210,590" fill="#a3472e"/>
  <rect x="230" y="280" width="16" height="310" fill="#2b3238"/>
  <polygon points="246,300 470,455 246,490" fill="#f3ecdf"/>
  <rect y="790" width="1200" height="110" fill="#8d7048"/>
</svg>`);
