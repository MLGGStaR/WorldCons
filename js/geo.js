// Country, continent and sub-national region names. Shared by the site and the data
// pipeline (pure data, no DOM). Continents follow the usual fan reading of the map:
// Turkey, Cyprus and Russia sit in Europe; the Gulf and the Levant sit in Asia.

export const CONTINENTS = {
  NA: 'North America',
  SA: 'South America',
  EU: 'Europe',
  AS: 'Asia',
  AF: 'Africa',
  OC: 'Oceania',
};

// code: [name, continent]
export const COUNTRIES = {
  AD: ['Andorra', 'EU'], AE: ['United Arab Emirates', 'AS'], AF: ['Afghanistan', 'AS'],
  AG: ['Antigua and Barbuda', 'NA'], AL: ['Albania', 'EU'], AM: ['Armenia', 'AS'],
  AO: ['Angola', 'AF'], AR: ['Argentina', 'SA'], AT: ['Austria', 'EU'], AU: ['Australia', 'OC'],
  AW: ['Aruba', 'NA'], AZ: ['Azerbaijan', 'AS'], BA: ['Bosnia and Herzegovina', 'EU'],
  BB: ['Barbados', 'NA'], BD: ['Bangladesh', 'AS'], BE: ['Belgium', 'EU'], BF: ['Burkina Faso', 'AF'],
  BG: ['Bulgaria', 'EU'], BH: ['Bahrain', 'AS'], BI: ['Burundi', 'AF'], BJ: ['Benin', 'AF'],
  BM: ['Bermuda', 'NA'], BN: ['Brunei', 'AS'], BO: ['Bolivia', 'SA'], BR: ['Brazil', 'SA'],
  BS: ['Bahamas', 'NA'], BT: ['Bhutan', 'AS'], BW: ['Botswana', 'AF'], BY: ['Belarus', 'EU'],
  BZ: ['Belize', 'NA'], CA: ['Canada', 'NA'], CD: ['DR Congo', 'AF'], CF: ['Central African Republic', 'AF'],
  CG: ['Congo', 'AF'], CH: ['Switzerland', 'EU'], CI: ["Côte d'Ivoire", 'AF'], CL: ['Chile', 'SA'],
  CM: ['Cameroon', 'AF'], CN: ['China', 'AS'], CO: ['Colombia', 'SA'], CR: ['Costa Rica', 'NA'],
  CU: ['Cuba', 'NA'], CV: ['Cape Verde', 'AF'], CW: ['Curaçao', 'NA'], CY: ['Cyprus', 'EU'],
  CZ: ['Czechia', 'EU'], DE: ['Germany', 'EU'], DJ: ['Djibouti', 'AF'], DK: ['Denmark', 'EU'],
  DM: ['Dominica', 'NA'], DO: ['Dominican Republic', 'NA'], DZ: ['Algeria', 'AF'], EC: ['Ecuador', 'SA'],
  EE: ['Estonia', 'EU'], EG: ['Egypt', 'AF'], ER: ['Eritrea', 'AF'], ES: ['Spain', 'EU'],
  ET: ['Ethiopia', 'AF'], FI: ['Finland', 'EU'], FJ: ['Fiji', 'OC'], FO: ['Faroe Islands', 'EU'],
  FR: ['France', 'EU'], GA: ['Gabon', 'AF'], GB: ['United Kingdom', 'EU'], GD: ['Grenada', 'NA'],
  GE: ['Georgia', 'AS'], GH: ['Ghana', 'AF'], GI: ['Gibraltar', 'EU'], GL: ['Greenland', 'NA'],
  GM: ['Gambia', 'AF'], GN: ['Guinea', 'AF'], GP: ['Guadeloupe', 'NA'], GR: ['Greece', 'EU'],
  GT: ['Guatemala', 'NA'], GU: ['Guam', 'OC'], GY: ['Guyana', 'SA'], HK: ['Hong Kong', 'AS'],
  HN: ['Honduras', 'NA'], HR: ['Croatia', 'EU'], HT: ['Haiti', 'NA'], HU: ['Hungary', 'EU'],
  ID: ['Indonesia', 'AS'], IE: ['Ireland', 'EU'], IL: ['Israel', 'AS'], IM: ['Isle of Man', 'EU'],
  IN: ['India', 'AS'], IQ: ['Iraq', 'AS'], IR: ['Iran', 'AS'], IS: ['Iceland', 'EU'], IT: ['Italy', 'EU'],
  JE: ['Jersey', 'EU'], JM: ['Jamaica', 'NA'], JO: ['Jordan', 'AS'], JP: ['Japan', 'AS'],
  KE: ['Kenya', 'AF'], KG: ['Kyrgyzstan', 'AS'], KH: ['Cambodia', 'AS'], KR: ['South Korea', 'AS'],
  KW: ['Kuwait', 'AS'], KY: ['Cayman Islands', 'NA'], KZ: ['Kazakhstan', 'AS'], LA: ['Laos', 'AS'],
  LB: ['Lebanon', 'AS'], LC: ['Saint Lucia', 'NA'], LI: ['Liechtenstein', 'EU'], LK: ['Sri Lanka', 'AS'],
  LR: ['Liberia', 'AF'], LS: ['Lesotho', 'AF'], LT: ['Lithuania', 'EU'], LU: ['Luxembourg', 'EU'],
  LV: ['Latvia', 'EU'], LY: ['Libya', 'AF'], MA: ['Morocco', 'AF'], MC: ['Monaco', 'EU'],
  MD: ['Moldova', 'EU'], ME: ['Montenegro', 'EU'], MG: ['Madagascar', 'AF'], MK: ['North Macedonia', 'EU'],
  ML: ['Mali', 'AF'], MM: ['Myanmar', 'AS'], MN: ['Mongolia', 'AS'], MO: ['Macau', 'AS'],
  MQ: ['Martinique', 'NA'], MR: ['Mauritania', 'AF'], MT: ['Malta', 'EU'], MU: ['Mauritius', 'AF'],
  MV: ['Maldives', 'AS'], MW: ['Malawi', 'AF'], MX: ['Mexico', 'NA'], MY: ['Malaysia', 'AS'],
  MZ: ['Mozambique', 'AF'], NA: ['Namibia', 'AF'], NC: ['New Caledonia', 'OC'], NE: ['Niger', 'AF'],
  NG: ['Nigeria', 'AF'], NI: ['Nicaragua', 'NA'], NL: ['Netherlands', 'EU'], NO: ['Norway', 'EU'],
  NP: ['Nepal', 'AS'], NZ: ['New Zealand', 'OC'], OM: ['Oman', 'AS'], PA: ['Panama', 'NA'],
  PE: ['Peru', 'SA'], PF: ['French Polynesia', 'OC'], PG: ['Papua New Guinea', 'OC'],
  PH: ['Philippines', 'AS'], PK: ['Pakistan', 'AS'], PL: ['Poland', 'EU'], PR: ['Puerto Rico', 'NA'],
  PS: ['Palestine', 'AS'], PT: ['Portugal', 'EU'], PY: ['Paraguay', 'SA'], QA: ['Qatar', 'AS'],
  RE: ['Réunion', 'AF'], RO: ['Romania', 'EU'], RS: ['Serbia', 'EU'], RU: ['Russia', 'EU'],
  RW: ['Rwanda', 'AF'], SA: ['Saudi Arabia', 'AS'], SC: ['Seychelles', 'AF'], SD: ['Sudan', 'AF'],
  SE: ['Sweden', 'EU'], SG: ['Singapore', 'AS'], SI: ['Slovenia', 'EU'], SK: ['Slovakia', 'EU'],
  SL: ['Sierra Leone', 'AF'], SM: ['San Marino', 'EU'], SN: ['Senegal', 'AF'], SO: ['Somalia', 'AF'],
  SR: ['Suriname', 'SA'], SV: ['El Salvador', 'NA'], SY: ['Syria', 'AS'], SZ: ['Eswatini', 'AF'],
  TC: ['Turks and Caicos', 'NA'], TG: ['Togo', 'AF'], TH: ['Thailand', 'AS'], TJ: ['Tajikistan', 'AS'],
  TL: ['Timor-Leste', 'AS'], TM: ['Turkmenistan', 'AS'], TN: ['Tunisia', 'AF'], TO: ['Tonga', 'OC'],
  TR: ['Turkey', 'EU'], TT: ['Trinidad and Tobago', 'NA'], TW: ['Taiwan', 'AS'], TZ: ['Tanzania', 'AF'],
  UA: ['Ukraine', 'EU'], UG: ['Uganda', 'AF'], US: ['United States', 'NA'], UY: ['Uruguay', 'SA'],
  UZ: ['Uzbekistan', 'AS'], VA: ['Vatican City', 'EU'], VC: ['Saint Vincent', 'NA'], VE: ['Venezuela', 'SA'],
  VG: ['British Virgin Islands', 'NA'], VI: ['US Virgin Islands', 'NA'], VN: ['Vietnam', 'AS'],
  VU: ['Vanuatu', 'OC'], WS: ['Samoa', 'OC'], XK: ['Kosovo', 'EU'], YE: ['Yemen', 'AS'],
  ZA: ['South Africa', 'AF'], ZM: ['Zambia', 'AF'], ZW: ['Zimbabwe', 'AF'],
};

export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export const CA_PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut',
  ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};

export const AU_STATES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia',
  SA: 'South Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};

export const REGIONS = { US: US_STATES, CA: CA_PROVINCES, AU: AU_STATES };

export function countryName(code) {
  return (COUNTRIES[code] || [code])[0];
}

export function continentOf(code) {
  return (COUNTRIES[code] || [null, null])[1];
}

export function regionName(country, region) {
  const table = REGIONS[country];
  return (table && table[region]) || region || '';
}

// Regional-indicator flag emoji for a two-letter code ("JP" -> 🇯🇵).
export function flag(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
