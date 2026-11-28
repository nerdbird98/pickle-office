/* =========================================================
   아트스캔 ArtScan — 샘플 데이터 (시연용)
   실제 서비스 데이터가 아닙니다. 모든 수치는 데모용입니다.
   ========================================================= */
(function () {
  "use strict";

  const GENRES = {
    painting: {
      key: "painting",
      label: "그림 (회화·판화)",
      short: "그림",
      hint: "그림은 <b>전체 정면</b>과 <b>낙관·서명</b> 2컷이 필수입니다.",
      slots: [
        { key: "front", name: "전체 정면", req: true, icon: "🖼", desc: "액자 포함 전모, 정면에서" },
        { key: "seal", name: "낙관·서명", req: true, icon: "🔖", desc: "서명·낙관 클로즈업" },
        { key: "back", name: "뒷면·에디션 표기", req: false, icon: "🧾", desc: "판번호(12/50)·소장 라벨 (권장)" }
      ],
      checks: [
        "캔버스 장력과 뒷면 곰팡이 흔적 없음 (사진 판독 기준)",
        "유화층 균열·박락 없이 안료층 유지",
        "액자·유리 반사 없이 정면 판독 가능",
        "낙관·서명 위치가 작가 후기 서명 형태와 유사",
        "이면 라벨·소장 스티커는 실물 2차 검증에서 확인"
      ]
    },
    ceramic: {
      key: "ceramic",
      label: "도자기",
      short: "도자기",
      hint: "도자기는 <b>앞·뒤·좌·우·위 5면</b>이 필수, <b>바닥 굽·명문</b>은 권장입니다.",
      slots: [
        { key: "front", name: "앞", req: true, icon: "🏺", desc: "문양 정면" },
        { key: "back", name: "뒤", req: true, icon: "🔄", desc: "반대 면" },
        { key: "left", name: "좌", req: true, icon: "↔", desc: "측면 90°" },
        { key: "right", name: "우", req: true, icon: "↔", desc: "측면 270°" },
        { key: "top", name: "위 (구연부)", req: true, icon: "⭕", desc: "아가리 정면" },
        { key: "foot", name: "바닥 굽·명문", req: false, icon: "🔍", desc: "굽 접지면·명문 (권장)" }
      ],
      checks: [
        "구연부 결손·마감 상태 양호",
        "굽 접지면 마모가 자연스럽고 인위적 손질 없음",
        "유약 균열(관개) 및 수리 접합 흔적 없음",
        "상감 문양 선명도가 시대 양식과 일치",
        "굽·명문 촬영 시 정밀 판독 가중치 상향"
      ]
    }
  };

  /* 작가 마스터 (샘플) — p50: 참고 시세 중앙값(원), 호당 평균가는 별도 표기 */
  const ARTISTS = [
    {
      id: "A-001", ko: "김환기", en: "Whanki Kim", hanja: "金煥基",
      aliases: ["수화", "樹話", "Kim Whanki", "김환기(金煥基)"],
      born: 1913, died: 1974, field: "근현대 회화", medium: "유화·점묘",
      p50: 180000000, hoe: 38000000, samples: 34, confidence: "A",
      seal: "화면 좌측 하단 <b>영문 'Whanki' 필기 서명</b>과 붉은 방형 낙관. 후기 점묘 연작은 서명 없이 이면 유성펜 기재가 많음.",
      note: "점·선·면 추상. 1970년대 뉴욕 시기 점묘 연작이 시세 상단을 형성."
    },
    {
      id: "A-002", ko: "박수근", en: "Park Soo-keun", hanja: "朴壽根",
      aliases: ["Park Sookeun", "박수근(朴壽根)"],
      born: 1914, died: 1965, field: "근현대 회화", medium: "유화·마티에르",
      p50: 145000000, hoe: 31000000, samples: 21, confidence: "A",
      seal: "대부분 <b>서명 없이 '水' 자 낙관</b> 또는 이면 묵서. 두터운 마티에르와 마대 위 거친 질감이 특징.",
      note: "돌·나무·가족 도상. 표면 요철이 강해 반사광 촬영에 취약."
    },
    {
      id: "A-003", ko: "이중섭", en: "Lee Jung-seob", hanja: "李仲燮",
      aliases: ["Lee Jung Seob", "이중섭(李仲燮)"],
      born: 1916, died: 1956, field: "근현대 회화", medium: "유화·은지화",
      p50: 98000000, hoe: 26000000, samples: 18, confidence: "A",
      seal: "붓글씨 <b>'중섭' 서명</b>이 우측 하단에 흐르듯 배치. 은지화는 담배은박 위 압인선과 이면 산화 흔적.",
      note: "황소·가족·게 도상. 은지화는 원본 은박 상태가 시세에 크게 작용."
    },
    {
      id: "A-004", ko: "천경자", en: "Chun Kyung-ja", hanja: "千鏡子",
      aliases: ["Chun Kyung Ja", "천경자(千鏡子)"],
      born: 1924, died: 2015, field: "근현대 채색화", medium: "채색화·필묵",
      p50: 65000000, hoe: 19000000, samples: 16, confidence: "A",
      seal: "화면 우하단 <b>한글 '천경자' 서명</b>과 붉은 인장. 섬세한 필선과 진채 안료의 발색이 기준.",
      note: "여인·꽃·뱀 도상. 진채 안료 박락 여부가 상태 등급의 핵심."
    },
    {
      id: "A-005", ko: "이우환", en: "Lee Ufan", hanja: "李禹煥",
      aliases: ["Lee Ufan", "이우환(李禹煥)"],
      born: 1936, died: null, field: "근현대 회화", medium: "유화·판화",
      p50: 72000000, hoe: 22000000, samples: 27, confidence: "A",
      seal: "화면 하단 <b>연필 또는 먹의 'Lee Ufan' 서명</b>, 제작연도 병기. 판화는 연필 서명과 판번호 동일 컷 필수.",
      note: "‘점으로부터’·‘From Line’ 연작. 판화 에디션 위조가 많아 판번호 대조가 중요."
    },
    {
      id: "A-006", ko: "장욱진", en: "Chang Ucchin", hanja: "張旭鎭",
      aliases: ["Chang Ukchin", "장욱진(張旭鎭)"],
      born: 1917, died: 1990, field: "근현대 회화", medium: "유화·캔버스",
      p50: 42000000, hoe: 14000000, samples: 12, confidence: "A",
      seal: "좌측 하단 <b>'욱진' 두 글자 서명</b>과 소형 낙관. 간결한 선묘와 여백이 특징.",
      note: "가족·동물·집 도상. 소품 다수로 표본 편차가 큼."
    },
    {
      id: "A-007", ko: "김창열", en: "Kim Tschang Yeul", hanja: "金昌烈",
      aliases: ["Kim Tschang-Yeul", "김창열(金昌烈)"],
      born: 1929, died: 2021, field: "근현대 회화", medium: "유화·물방울",
      p50: 55000000, hoe: 17500000, samples: 9, confidence: "A",
      seal: "이면에 <b>한자 '金昌烈'과 제작연도</b> 기재, 앞면 서명은 드묾.",
      note: "물방울 연작. 이면 기재와 캔버스 규격으로 연대 추정."
    },
    {
      id: "A-008", ko: "유근형", en: "Yu Geun-hyeong", hanja: "柳根瀅",
      aliases: ["Yu Kunhyung", "유근형(柳根瀅)"],
      born: 1920, died: 1999, field: "도자기", medium: "청자·상감",
      p50: 8500000, hoe: 8500000, samples: 11, confidence: "A",
      seal: "굽 안쪽 <b>음각 '根瀅' 명문</b> 또는 인장. 청자 유색의 환원 정도와 상감 백토의 발색 확인.",
      note: "근현대 청자 재현의 대표 장인. 굽·명문 판독이 감별 핵심."
    },
    {
      id: "A-009", ko: "지순탁", en: "Ji Sun-tak", hanja: "池順鐸",
      aliases: ["Ji Suntak", "지순탁(池順鐸)"],
      born: 1931, died: 2014, field: "도자기", medium: "분청·박지",
      p50: 4200000, hoe: 4200000, samples: 8, confidence: "A",
      seal: "굽 접지면 <b>압인 '順鐸'</b>. 박지 문양의 백토 잔여와 유약 흐름이 특징.",
      note: "분청 박지 기법 재현. 문양 배치와 백토 두께가 판독 포인트."
    },
    {
      id: "A-010", ko: "김정옥", en: "Kim Jeong-ok", hanja: "金正玉",
      aliases: ["Kim Jeong Ok", "김정옥(金正玉)"],
      born: 1935, died: null, field: "도자기", medium: "백자·사기장",
      p50: 2600000, hoe: 2600000, samples: 6, confidence: "A",
      seal: "굽 안쪽 <b>청화 또는 각인 '金正玉'</b>. 유면의 미세 기포와 유백색 발색 비교.",
      note: "백자·달항아리 재현. 국가무형문화재 사기장 계보."
    }
  ];

  /* KBS <TV쇼 진품명품> 레퍼런스 — 참고 전용, 시세 모델 미반영
     aiLow/aiHigh: 시연용 백테스트 비교 예시 (실서비스는 실제 낙찰가 기준 MAPE 공개) */
  const BROADCAST_REFS = [
    {
      id: "BR-01", category: "고서·지도", title: "대동여지도 채색신유본",
      era: "1861년(신유년) 김정호", broadcast: 2500000000,
      aiLow: 2200000000, aiHigh: 2700000000,
      cond: "필사 채색본 여부, 접첩 22첩 완질, 지도 경계 접힘선 마모, 채색 안료의 퇴색 정도가 핵심. 후대 필사본과 종이 섬유·인쇄 상태로 구분."
    },
    {
      id: "BR-02", category: "도자기", title: "청자 음각 연화문 매병",
      era: "고려 12세기", broadcast: 2500000000,
      aiLow: 2100000000, aiHigh: 2600000000,
      cond: "음각선의 깊이와 유약 두께, 구연부 결손 여부, 굽 접지면의 태토색. 상감이 아닌 음각 기법의 선명도가 감별 포인트."
    },
    {
      id: "BR-03", category: "도자기", title: "분청사기 박지모란당초문 호",
      era: "조선 15세기", broadcast: 2000000000,
      aiLow: 1800000000, aiHigh: 2200000000,
      cond: "박지(백토 긁기) 문양의 잔여 백토, 유약 흐름 자국, 굽의 모래받침 흔적. 문양 배치가 시대 양식과 맞는지 대조."
    },
    {
      id: "BR-04", category: "회화", title: "석천한유도",
      era: "조선 후기 (전 석천)", broadcast: 1500000000,
      aiLow: 1350000000, aiHigh: 1650000000,
      cond: "견본 바탕의 변색·충해, 장황(표구) 교체 이력, 필선의 담묵 처리, 인장·제발의 먹색과 종이 상태."
    },
    {
      id: "BR-05", category: "도자기", title: "청자 상감포도동자문 매병",
      era: "고려 13세기", broadcast: 1500000000,
      aiLow: 1400000000, aiHigh: 1700000000,
      cond: "상감 백토·흑토의 선명도, 유약 관개(균열) 범위, 구연부·저부 수리 흔적, 포도송이 문양의 세부 표현."
    },
    {
      id: "BR-06", category: "서예", title: "추사 불기심란 (不俗茀己心瀾)",
      era: "조선 후기 김정희", broadcast: 1000000000,
      aiLow: 900000000, aiHigh: 1150000000,
      cond: "추사체 필획의 갈필·농담, 종이 발색과 배접 상태, 낙관·관지의 인면, 후대 임서본과의 필압 차이."
    },
    {
      id: "BR-07", category: "도자기", title: "청자 양각 연화문 완",
      era: "고려 12세기", broadcast: 80000000,
      aiLow: 62000000, aiHigh: 74000000,
      cond: "양각 문양의 성형 깊이, 유약 두께와 침전, 구연부 마감. 문양이 선명하나 파손 이력이 확인되어 AI가 보수적으로 낮게 산정한 사례."
    }
  ];

  const EXPERTS = [
    {
      id: "E-01", name: "김지훈", field: "근현대 회화",
      org: "경매사 스페셜리스트 15년 (서울옥션 출신)",
      adopted: 92, sales: 420000000, rate: 84,
      proof: "위촉장·경력증명·대표 감정 이력 3건"
    },
    {
      id: "E-02", name: "박서연", field: "도자기·고미술",
      org: "(사)한국미술품시가감정협회 감정위원",
      adopted: 41, sales: 160000000, rate: 76,
      proof: "감정위원 위촉 확인서·경력 20년"
    },
    {
      id: "E-03", name: "이정민", field: "판화·에디션",
      org: "케이옥션 판화 부문 스페셜리스트 9년",
      adopted: 14, sales: 48000000, rate: 71,
      proof: "재직·경력증명·에디션 대조 이력"
    },
    {
      id: "E-04", name: "최유진", field: "근현대 회화",
      org: "미술사 전공 · 국공립미술관 학예사",
      adopted: 6, sales: 12000000, rate: 68,
      proof: "학예사 경력증명·전시 이력"
    },
    {
      id: "E-05", name: "정현우", field: "도자기",
      org: "고미술업계 14년 · 감정 보조",
      adopted: 12, sales: 31000000, rate: 72,
      proof: "경력증명·감정 이력 3건"
    }
  ];

  /* 갤러리 시드 매물 — endMinutes: 로드 시점 기준 경매 종료까지 분 */
  const LISTINGS = [
    {
      id: "L-101", artistId: "A-001", artist: "김환기", title: "무제 (점)",
      year: "1973", medium: "캔버스에 유채", size: "46 × 38 cm",
      type: "fixed", price: 88000000,
      estimateLow: 76000000, estimateHigh: 96000000,
      image: "dots", verified: true, views: 1284,
      opinion: {
        expertId: "E-01",
        text: "1970년대 뉴욕 시기 점묘의 밀도와 청색 안료 발색이 자연스럽습니다. 좌측 하단 서명 필획은 동일 시기 후기 서명과 유사하나, 진위는 실물 2차 검증이 필요합니다.",
        adoptedAt: "2026-11-24"
      }
    },
    {
      id: "L-102", artistId: "A-002", artist: "박수근", title: "나무와 두 여인",
      year: "1962", medium: "캔버스에 유채", size: "45 × 30 cm",
      type: "auction", price: 123000000,
      estimateLow: 140000000, estimateHigh: 180000000,
      startPrice: 98000000, reserve: 120000000, current: 123000000, bids: 7,
      endMinutes: 82, image: "figure", verified: true, views: 2210
    },
    {
      id: "L-103", artistId: "A-003", artist: "이중섭", title: "황소",
      year: "1953", medium: "종이에 은지화", size: "22 × 28 cm",
      type: "auction", price: 46000000,
      estimateLow: 60000000, estimateHigh: 80000000,
      startPrice: 42000000, reserve: 52000000, current: 46000000, bids: 3,
      endMinutes: 2.8, image: "bull", verified: true, views: 3480,
      opinion: {
        expertId: "E-03",
        text: "은박 압인선의 필압과 이면 산화 흔적이 1950년대 은지화 계열과 일치합니다. 다만 에디션 없는 단품으로 서명 부분 실물 대조가 필요합니다.",
        adoptedAt: "2026-11-25"
      }
    },
    {
      id: "L-104", artistId: "A-004", artist: "천경자", title: "길",
      year: "1980", medium: "종이에 채색", size: "60 × 40 cm",
      type: "fixed", price: 26000000,
      estimateLow: 22000000, estimateHigh: 29000000,
      image: "colorfield", verified: true, views: 612
    },
    {
      id: "L-105", artistId: "A-008", artist: "유근형", title: "청자 상감 연화문 병",
      year: "1980년대", medium: "청자 상감", size: "H 28 cm",
      type: "auction", price: 6500000,
      estimateLow: 8000000, estimateHigh: 11000000,
      startPrice: 6000000, reserve: 7800000, current: 6500000, bids: 2,
      endMinutes: 300, image: "celadon", verified: true, views: 430,
      opinion: {
        expertId: "E-02",
        text: "유색의 환원 발색과 상감 백토의 두께가 근현대 청자 재현 양식에 부합합니다. 굽 안쪽 명문은 사진으로 판독이 어려워 굽 촬영본 확인이 필요합니다.",
        adoptedAt: "2026-11-26"
      }
    },
    {
      id: "L-106", artistId: "A-009", artist: "지순탁", title: "분청사기 박지문 호",
      year: "1990년대", medium: "분청 박지", size: "H 24 cm",
      type: "fixed", price: 4200000,
      estimateLow: 3600000, estimateHigh: 4800000,
      image: "buncheong", verified: true, views: 288
    },
    {
      id: "L-107", artistId: null, artist: "작가 미상", title: "조선 백자 달항아리 (전)",
      year: "18세기 추정", medium: "백자", size: "H 41 cm",
      type: "auction", price: 12500000,
      estimateLow: 18000000, estimateHigh: 24000000,
      startPrice: 12000000, reserve: 16000000, current: 12500000, bids: 1,
      endMinutes: 1680, image: "moonjar", verified: true, views: 1940
    },
    {
      id: "L-108", artistId: "A-005", artist: "이우환", title: "From Point No.12",
      year: "1979", medium: "종이에 석판화, 12/50", size: "56 × 42 cm",
      type: "fixed", price: 7800000,
      estimateLow: 6800000, estimateHigh: 8600000,
      image: "print", verified: true, views: 954
    }
  ];

  const TEXT = {
    disclaimer:
      "본 리포트는 공개된 경매 낙찰 기록을 바탕으로 산출한 <b>경매 데이터 기반 참고 추정가</b>와 <b>위탁 권장가</b>이며, <b>감정서·감정평가액이 아닙니다.</b> 작품의 진위나 공적 가치를 확정하지 않으며, 실제 거래 가격은 상태·수요·거래 조건에 따라 달라집니다. 표본이 부족한 경우 가격을 제시하지 않습니다. 진위 확인은 제휴 감정사의 별도 검증을 거칩니다.",
    opinionNotice:
      "전문가 검토 의견은 등록 심사를 통과한 전문가가 <b>사진과 입력 정보만으로 작성한 150자 이내 참고 소견</b>이며, <b>감정서·감정평가액이 아닙니다.</b> 작품의 진위를 확정하지 않으며, 실물 감식을 통한 제휴 감정사의 검증과는 구분됩니다.",
    shareLine:
      "AI 시세 스캔 · 참고 추정가 확인 (경매 데이터 기반 / 진위 보증 아님)",
    boostNotice:
      "이 매물에는 판매자가 구매한 유료 옵션(10,000원)으로 작성된 전문가 검토 소견(참고 소견·150자 이내)이 포함되어 있으며, 그 대가로 목록 상단 우대 노출이 적용됩니다. 소견은 감정서·감정평가액이 아니며 작품의 진위를 확정하지 않습니다."
  };

  const GRADES = {
    standard: { key: "standard", label: "일반", cls: "g-standard", adopted: 0, sales: 0 },
    silver: { key: "silver", label: "실버", cls: "g-silver", adopted: 10, sales: 30000000 },
    gold: { key: "gold", label: "골드", cls: "g-gold", adopted: 30, sales: 100000000 },
    master: { key: "master", label: "마스터", cls: "g-master", adopted: 80, sales: 300000000 }
  };

  window.ARTDATA = {
    GENRES: GENRES,
    ARTISTS: ARTISTS,
    BROADCAST_REFS: BROADCAST_REFS,
    EXPERTS: EXPERTS,
    LISTINGS: LISTINGS,
    TEXT: TEXT,
    GRADES: GRADES
  };
})();
