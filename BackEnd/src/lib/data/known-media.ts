export const KNOWN_MEDIA: Record<string, { bias: string; score: number; country: string }> = {
    // GAUCHE
    "humanite.fr": { bias: "EXTREME_LEFT", score: -80, country: "FR" },
    "mediapart.fr": { bias: "LEFT", score: -60, country: "FR" },
    "liberation.fr": { bias: "LEFT", score: -50, country: "FR" },
    "nouvelobs.com": { bias: "CENTER_LEFT", score: -30, country: "FR" },
    "lemonde.fr": { bias: "CENTER_LEFT", score: -20, country: "FR" },

    // CENTRE & PRO-GOUV
    "francetvinfo.fr": { bias: "CENTER", score: 0, country: "FR" },
    "20minutes.fr": { bias: "CENTER", score: 0, country: "FR" },
    "lesechos.fr": { bias: "CENTER_RIGHT", score: 15, country: "FR" },
    "lepoint.fr": { bias: "CENTER_RIGHT", score: 25, country: "FR" },

    // DROITE
    "lefigaro.fr": { bias: "RIGHT", score: 40, country: "FR" },
    "valeursactuelles.com": { bias: "EXTREME_RIGHT", score: 75, country: "FR" },
    "cnews.fr": { bias: "EXTREME_RIGHT", score: 80, country: "FR" },
    "fdesouche.com": { bias: "EXTREME_RIGHT", score: 95, country: "FR" },

    // SATIRE
    "legorafi.fr": { bias: "SATIRE", score: 0, country: "FR" },

    // US
    "cnn.com": { bias: "LEFT", score: -40, country: "US" },
    "nytimes.com": { bias: "CENTER_LEFT", score: -30, country: "US" },
    "reuters.com": { bias: "CENTER", score: 0, country: "US" },
    "foxnews.com": { bias: "RIGHT", score: 60, country: "US" },
    "breitbart.com": { bias: "EXTREME_RIGHT", score: 90, country: "US" }
};
