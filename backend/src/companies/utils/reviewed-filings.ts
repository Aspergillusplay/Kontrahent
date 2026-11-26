type Figure = 'revenue' | 'profit' | 'assets' | 'equity';
type Transcription = {
  ico: string;
  statement: number;
  period: string;
  digest: string;
  pages: number[];
  thousandsEUR: Partial<Record<Figure, number>>;
};

// Current-period figures reviewed against the individual RÚZ filing. The document
// number is the public attachment ID. For a ZIP, pages refer to the enclosed PDF.
const reviewedDocuments: Record<number, Transcription> = {
  // Slovak Telekom
  12681005: {
    ico: '35763469', statement: 6876580, period: '2025-12', pages: [5, 7],
    digest: '271f2dd4cc5f14b310424de4ee2c9fa6d4e442c49749cc48a3f9732a30bf06e4',
    thousandsEUR: { revenue: 864_525, profit: 124_303, assets: 1_866_330, equity: 1_211_338 },
  },
  // Kia Slovakia
  12800758: {
    ico: '35876832', statement: 6995571, period: '2025-12', pages: [6, 8],
    digest: 'dc5af491946b4a2e5115f1ecb818f81f6bf3f203f68d92576eda7486a888d73e',
    thousandsEUR: { revenue: 7_117_614, profit: 451_021, assets: 4_132_924, equity: 2_593_786 },
  },
  // Slovenský plynárenský priemysel
  12715348: {
    ico: '35815256', statement: 6961263, period: '2025-12', pages: [5, 7],
    digest: 'ccf312c369bc1bd4790298641885ff8e8aa17cdcf883d76d9eab04c91b123925',
    thousandsEUR: { revenue: 2_463_185, profit: 238_296, assets: 3_765_233, equity: 2_742_433 },
  },
  // ESET
  12675296: {
    ico: '31333532', statement: 6941236, period: '2025-12', pages: [4, 6, 7],
    digest: '4130b82a60c32616f234c5a6b78594685810f19979457107bbfc61ed8c67feb1',
    thousandsEUR: { revenue: 293_878, profit: 63_897, assets: 702_111, equity: 64_243 },
  },
  // AUMOVIO Slovakia
  12676850: {
    ico: '36633623', statement: 6942006, period: '2025-12', pages: [5, 7],
    digest: '0956779053fca0956f0dc59d33b81c26eac4345882a23689d36f17f5b886e8e6',
    thousandsEUR: { revenue: 501_072, profit: 4_614, assets: 234_621, equity: 112_123 },
  },
  // Faurecia Automotive Slovakia
  12736404: {
    ico: '50170074', statement: 6971664, period: '2025-12', pages: [5, 7],
    digest: '3c1623365b0c539a7c17bdf3d661b0ec7840b26a9ec60f658dfbc20612fbcf83',
    thousandsEUR: { revenue: 704_405, profit: -35_714, assets: 248_341, equity: 26_697 },
  },
  // Volkswagen Slovakia
  12723642: {
    ico: '35757442', statement: 6965375, period: '2025-12', pages: [1],
    digest: '2f5f8bd44f4cbbb180ee2971ca32be328ed34c224236a249293a842acabd89de',
    thousandsEUR: { revenue: 12_023_876, profit: 226_458 },
  },
  // Všeobecná úverová banka
  12533108: {
    ico: '31320155', statement: 6868466, period: '2025-12', pages: [2, 3],
    digest: '54db5be9866616670ece8cd557e8de5c56a623446096c523fc1fa2cc938dfe8e',
    thousandsEUR: { profit: 268_576, assets: 26_253_295, equity: 2_402_157 },
  },
};

export function reviewedFigures(ico: string, statement: {id: number; obdobieDo?: string; konsolidovana?: boolean}, file: {id: number; digest?: string}) {
  const review = reviewedDocuments[file.id];
  if (!review || review.ico !== ico || review.statement !== statement.id || review.period !== statement.obdobieDo ||
      statement.konsolidovana || review.digest !== file.digest) return undefined;
  return {
    figures: Object.fromEntries(Object.entries(review.thousandsEUR).map(([field, value]) => [field, value * 1000])),
    source: { attachment_id: file.id, pages: review.pages },
  };
}
