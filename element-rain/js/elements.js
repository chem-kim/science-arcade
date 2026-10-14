/*
 * 원소 데이터 (원소 이름은 대한화학회 2014 개정안, 교과서 표기 기준)
 * [기호, 이름, 예전 이름(정답 인정), 영어 이름, 기억 고리]
 */
(function (global) {
  'use strict';

  const RAW = [
    ['H', '수소', '', 'Hydrogen', '물(H₂O)의 H · 우주에서 가장 많은 원소'],
    ['He', '헬륨', '', 'Helium', '풍선을 띄우는 기체 · 태양(helios)에서 처음 발견'],
    ['Li', '리튬', '', 'Lithium', '휴대폰 배터리(리튬 이온 전지)'],
    ['Be', '베릴륨', '', 'Beryllium', '에메랄드(녹주석, beryl)에 들어 있어요'],
    ['B', '붕소', '', 'Boron', '붕사(borax) · 내열 유리'],
    ['C', '탄소', '', 'Carbon', '숯·흑연·다이아몬드 · 이산화 탄소(CO₂)'],
    ['N', '질소', '', 'Nitrogen', '공기의 약 78%'],
    ['O', '산소', '', 'Oxygen', '공기의 약 21% · 호흡'],
    ['F', '플루오린', '불소', 'Fluorine', '치약 속 플루오린화물(불소)'],
    ['Ne', '네온', '', 'Neon', '빨간 네온사인'],
    ['Na', '소듐', '나트륨', 'Sodium', '라틴어 Natrium → Na · 소금(NaCl)'],
    ['Mg', '마그네슘', '', 'Magnesium', '불꽃놀이의 하얀 빛'],
    ['Al', '알루미늄', '', 'Aluminium', '알루미늄 호일·음료수 캔'],
    ['Si', '규소', '실리콘', 'Silicon', '반도체 칩 · 모래(SiO₂)'],
    ['P', '인', '', 'Phosphorus', '성냥 · DNA의 뼈대'],
    ['S', '황', '', 'Sulfur', '화산의 달걀 썩는 냄새(H₂S)'],
    ['Cl', '염소', '', 'Chlorine', '수영장 소독 · 소금(NaCl)의 Cl'],
    ['Ar', '아르곤', '', 'Argon', '공기의 약 1% · 반응을 잘 안 하는(argos, 게으른) 기체'],
    ['K', '포타슘', '칼륨', 'Potassium', '라틴어 Kalium → K · 바나나에 많아요'],
    ['Ca', '칼슘', '', 'Calcium', '뼈와 우유 · 조개껍데기(CaCO₃)'],
    ['Sc', '스칸듐', '', 'Scandium', '스칸디나비아에서 발견'],
    ['Ti', '타이타늄', '티타늄,티탄', 'Titanium', '가볍고 튼튼한 안경테·인공 관절'],
    ['V', '바나듐', '', 'Vanadium', '공구용 강철'],
    ['Cr', '크로뮴', '크롬', 'Chromium', '반짝이는 크롬 도금 · 스테인리스강'],
    ['Mn', '망가니즈', '망간', 'Manganese', '건전지 속 이산화 망가니즈(MnO₂)'],
    ['Fe', '철', '', 'Iron', '라틴어 Ferrum → Fe · 혈액 속 헤모글로빈'],
    ['Co', '코발트', '', 'Cobalt', '코발트 블루 물감'],
    ['Ni', '니켈', '', 'Nickel', '동전 · 도금'],
    ['Cu', '구리', '', 'Copper', '라틴어 Cuprum → Cu · 전선'],
    ['Zn', '아연', '', 'Zinc', '아연 도금 · 건전지 껍데기'],
    ['Ga', '갈륨', '', 'Gallium', '손바닥 위에서 녹는 금속 · 프랑스(Gallia)'],
    ['Ge', '저마늄', '게르마늄', 'Germanium', '독일(Germania) · 반도체'],
    ['As', '비소', '', 'Arsenic', '독약으로 유명한 원소'],
    ['Se', '셀레늄', '', 'Selenium', '달(selene)에서 따온 이름'],
    ['Br', '브로민', '브롬', 'Bromine', '상온에서 액체인 비금속 · 냄새(bromos)'],
    ['Kr', '크립톤', '', 'Krypton', '숨어 있는(kryptos) 기체'],
    ['Rb', '루비듐', '', 'Rubidium', '루비처럼 붉은 스펙트럼선'],
    ['Sr', '스트론튬', '', 'Strontium', '불꽃놀이의 빨간색'],
    ['Y', '이트륨', '', 'Yttrium', '스웨덴 이테르비 마을에서 발견'],
    ['Zr', '지르코늄', '', 'Zirconium', '인공 보석 큐빅(지르코니아)'],
    ['Nb', '나이오븀', '니오브,니오븀', 'Niobium', '초전도 자석'],
    ['Mo', '몰리브데넘', '몰리브덴', 'Molybdenum', '단단한 합금강'],
    ['Tc', '테크네튬', '', 'Technetium', '최초의 인공(techne) 원소'],
    ['Ru', '루테늄', '', 'Ruthenium', '러시아(Ruthenia)'],
    ['Rh', '로듐', '', 'Rhodium', '장미(rhodon)빛 염 · 자동차 촉매'],
    ['Pd', '팔라듐', '', 'Palladium', '자동차 배기가스 촉매'],
    ['Ag', '은', '', 'Silver', '라틴어 Argentum → Ag · 아르헨티나 = 은의 나라'],
    ['Cd', '카드뮴', '', 'Cadmium', '충전지(니켈-카드뮴) · 이타이이타이병'],
    ['In', '인듐', '', 'Indium', '터치스크린(ITO) · 남색(indigo) 스펙트럼선'],
    ['Sn', '주석', '', 'Tin', '라틴어 Stannum → Sn · 통조림 캔 도금'],
    ['Sb', '안티모니', '안티몬', 'Antimony', '라틴어 Stibium → Sb'],
    ['Te', '텔루륨', '', 'Tellurium', '지구(tellus)에서 따온 이름'],
    ['I', '아이오딘', '요오드', 'Iodine', '상처 소독약 · 보라색(iodes) 기체'],
    ['Xe', '제논', '크세논', 'Xenon', '자동차 HID 전조등'],
    ['Cs', '세슘', '', 'Caesium', '원자시계의 기준'],
    ['Ba', '바륨', '', 'Barium', '위장 X선 촬영 조영제 · 불꽃놀이 초록색'],
    ['La', '란타넘', '란탄', 'Lanthanum', '란타넘족의 첫 원소'],
    ['Ce', '세륨', '', 'Cerium', '라이터 부싯돌'],
    ['Pr', '프라세오디뮴', '', 'Praseodymium', ''],
    ['Nd', '네오디뮴', '', 'Neodymium', '아주 센 네오디뮴 자석'],
    ['Pm', '프로메튬', '', 'Promethium', '불을 훔친 프로메테우스'],
    ['Sm', '사마륨', '', 'Samarium', ''],
    ['Eu', '유로퓸', '', 'Europium', '유럽(Europe) · 지폐 위조 방지 형광'],
    ['Gd', '가돌리늄', '', 'Gadolinium', 'MRI 조영제'],
    ['Tb', '터븀', '테르븀', 'Terbium', ''],
    ['Dy', '디스프로슘', '', 'Dysprosium', ''],
    ['Ho', '홀뮴', '', 'Holmium', '스톡홀름(Holmia)'],
    ['Er', '어븀', '에르븀', 'Erbium', ''],
    ['Tm', '툴륨', '', 'Thulium', ''],
    ['Yb', '이터븀', '이테르븀', 'Ytterbium', ''],
    ['Lu', '루테튬', '', 'Lutetium', '파리(Lutetia)'],
    ['Hf', '하프늄', '', 'Hafnium', '코펜하겐(Hafnia)'],
    ['Ta', '탄탈럼', '탄탈', 'Tantalum', '휴대폰 축전기'],
    ['W', '텅스텐', '', 'Tungsten', '독일어 Wolfram → W · 백열전구 필라멘트'],
    ['Re', '레늄', '', 'Rhenium', '라인강(Rhenus)'],
    ['Os', '오스뮴', '', 'Osmium', '가장 밀도가 큰 원소'],
    ['Ir', '이리듐', '', 'Iridium', '무지개(iris)처럼 다양한 색의 화합물'],
    ['Pt', '백금', '', 'Platinum', '백금 반지 · 작은 은(platina)'],
    ['Au', '금', '', 'Gold', '라틴어 Aurum → Au · 오로라(빛나는 새벽)'],
    ['Hg', '수은', '', 'Mercury', '라틴어 Hydrargyrum(물 같은 은) → Hg · 액체 금속'],
    ['Tl', '탈륨', '', 'Thallium', ''],
    ['Pb', '납', '', 'Lead', '라틴어 Plumbum → Pb · 배관공(plumber)'],
    ['Bi', '비스무트', '', 'Bismuth', '무지갯빛 계단 모양 결정'],
    ['Po', '폴로늄', '', 'Polonium', '마리 퀴리의 조국 폴란드'],
    ['At', '아스타틴', '', 'Astatine', '불안정한(astatos) 원소'],
    ['Rn', '라돈', '', 'Radon', '땅에서 나오는 방사성 기체'],
    ['Fr', '프랑슘', '', 'Francium', '프랑스'],
    ['Ra', '라듐', '', 'Radium', '퀴리 부부가 발견 · 방사선(radius)'],
    ['Ac', '악티늄', '', 'Actinium', '악티늄족의 첫 원소'],
    ['Th', '토륨', '', 'Thorium', '천둥의 신 토르'],
    ['Pa', '프로트악티늄', '', 'Protactinium', ''],
    ['U', '우라늄', '', 'Uranium', '천왕성(Uranus) · 원자력 발전 연료'],
    ['Np', '넵투늄', '', 'Neptunium', '해왕성(Neptune)'],
    ['Pu', '플루토늄', '', 'Plutonium', '명왕성(Pluto)'],
    ['Am', '아메리슘', '', 'Americium', '아메리카 · 화재 경보기'],
    ['Cm', '퀴륨', '', 'Curium', '퀴리 부부'],
    ['Bk', '버클륨', '', 'Berkelium', '버클리'],
    ['Cf', '캘리포늄', '', 'Californium', '캘리포니아'],
    ['Es', '아인슈타이늄', '', 'Einsteinium', '아인슈타인'],
    ['Fm', '페르뮴', '', 'Fermium', '페르미'],
    ['Md', '멘델레븀', '', 'Mendelevium', '주기율표를 만든 멘델레예프'],
    ['No', '노벨륨', '', 'Nobelium', '노벨'],
    ['Lr', '로렌슘', '', 'Lawrencium', '로렌스'],
    ['Rf', '러더포듐', '', 'Rutherfordium', '원자핵을 발견한 러더퍼드'],
    ['Db', '더브늄', '', 'Dubnium', '러시아 두브나'],
    ['Sg', '시보귬', '', 'Seaborgium', '시보그'],
    ['Bh', '보륨', '', 'Bohrium', '원자 모형의 보어'],
    ['Hs', '하슘', '', 'Hassium', '독일 헤센 주'],
    ['Mt', '마이트너륨', '', 'Meitnerium', '마이트너'],
    ['Ds', '다름슈타튬', '', 'Darmstadtium', '독일 다름슈타트'],
    ['Rg', '뢴트게늄', '', 'Roentgenium', 'X선을 발견한 뢴트겐'],
    ['Cn', '코페르니슘', '', 'Copernicium', '코페르니쿠스'],
    ['Nh', '니호늄', '', 'Nihonium', '일본(니혼)에서 발견'],
    ['Fl', '플레로븀', '', 'Flerovium', ''],
    ['Mc', '모스코븀', '', 'Moscovium', '모스크바'],
    ['Lv', '리버모륨', '', 'Livermorium', ''],
    ['Ts', '테네신', '', 'Tennessine', '미국 테네시'],
    ['Og', '오가네손', '', 'Oganesson', '가장 무거운 원소'],
  ];

  const NOBLE = [2, 10, 18, 36, 54, 86, 118];
  const ALKALI = [3, 11, 19, 37, 55, 87];
  const ALKALINE = [4, 12, 20, 38, 56, 88];
  const HALOGEN = [9, 17, 35, 53, 85, 117];
  const NONMETAL = [1, 6, 7, 8, 15, 16, 34];
  const METALLOID = [5, 14, 32, 33, 51, 52];

  function category(z) {
    if (NOBLE.includes(z)) return 'noble';
    if (ALKALI.includes(z)) return 'alkali';
    if (ALKALINE.includes(z)) return 'alkaline';
    if (HALOGEN.includes(z)) return 'halogen';
    if (NONMETAL.includes(z)) return 'nonmetal';
    if (METALLOID.includes(z)) return 'metalloid';
    if (z >= 57 && z <= 71) return 'lanthanide';
    if (z >= 89 && z <= 103) return 'actinide';
    const { group } = position(z);
    return group >= 3 && group <= 12 ? 'transition' : 'post';
  }

  /** 주기율표 위치. f 구역(란타넘족·악티늄족)은 아래 8·9번째 줄 */
  function position(z) {
    if (z === 1) return { period: 1, group: 1, row: 1, col: 1 };
    if (z === 2) return { period: 1, group: 18, row: 1, col: 18 };
    const starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
    let period = 2, start = 3;
    starts.forEach(([s, p]) => { if (z >= s) { period = p; start = s; } });
    const k = z - start;
    let group;
    if (period <= 3) group = k < 2 ? k + 1 : k + 11;
    else if (period <= 5) group = k + 1;
    else {
      if (k < 2) group = k + 1;
      else if (k <= 16) {
        // 란타넘족(57~71), 악티늄족(89~103)
        return { period, group: 3, row: period + 3, col: k + 1, fblock: true };
      } else group = k - 13;
    }
    return { period, group, row: period, col: group };
  }

  const LIST = RAW.map(([symbol, name, alt, en, note], i) => {
    const z = i + 1;
    return {
      z, symbol, name, en, note,
      alts: alt ? alt.split(',') : [],
      category: category(z),
      ...position(z),
    };
  });
  const BY_Z = Object.fromEntries(LIST.map(e => [e.z, e]));
  const BY_SYMBOL = Object.fromEntries(LIST.map(e => [e.symbol, e]));
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  /** 기호가 영어 이름 앞글자와 다른 원소(라틴어·독일어 유래) */
  const LATIN = [11, 19, 26, 29, 47, 50, 51, 74, 79, 80, 82];

  const LEVELS = {
    basic: { label: '기초', desc: '1~20번', pool: range(1, 20), fallMs: 9000 },
    challenge: { label: '도전', desc: '1~36번 + 자주 쓰는 원소', pool: [...range(1, 36), 47, 50, 53, 56, 78, 79, 80, 82, 92], fallMs: 8500 },
    all: { label: '마스터', desc: '전체 118개', pool: range(1, 118), fallMs: 8000 },
    latin: { label: '라틴어 특강', desc: '기호가 영어 이름과 다른 11개', pool: LATIN, fallMs: 8500 },
  };

  const QTYPES = {
    name2sym: { label: '이름 → 기호', placeholder: '원소 기호 (예: Na)', answerKind: 'symbol' },
    sym2name: { label: '기호 → 이름', placeholder: '원소 이름 (예: 소듐)', answerKind: 'name' },
    num2sym: { label: '원자 번호 → 기호', placeholder: '원소 기호 (예: Na)', answerKind: 'symbol' },
  };

  /** 외움송: 원소 이름 첫 글자 */
  const SONG = {
    1: '수', 2: '헬', 3: '리', 4: '베', 5: '붕', 6: '탄', 7: '질', 8: '산', 9: '플', 10: '네',
    11: '나', 12: '마', 13: '알', 14: '규', 15: '인', 16: '황', 17: '염', 18: '아', 19: '칼', 20: '칼',
    21: '스', 22: '타', 23: '바', 24: '크', 25: '망', 26: '철', 27: '코', 28: '니', 29: '구', 30: '아',
    31: '갈', 32: '저', 33: '비', 34: '셀', 35: '브', 36: '크',
  };

  const CATEGORY_LABEL = {
    alkali: '알칼리 금속', alkaline: '알칼리 토금속', transition: '전이 금속', post: '전이 후 금속',
    metalloid: '준금속', nonmetal: '비금속', halogen: '할로젠', noble: '18족(비활성 기체)',
    lanthanide: '란타넘족', actinide: '악티늄족',
  };

  /** 이름 표시: 예전 이름이 있으면 괄호로 */
  const displayName = e => (e.alts.length ? `${e.name}(${e.alts[0]})` : e.name);

  global.ERElements = { LIST, BY_Z, BY_SYMBOL, LEVELS, QTYPES, SONG, LATIN, CATEGORY_LABEL, displayName, range };
})(window);
