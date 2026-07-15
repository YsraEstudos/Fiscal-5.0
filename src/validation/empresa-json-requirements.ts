import { buscarElementoDeep } from '../utils/selectors.ts';

export type CampoJsonEmpresa = 'ncm' | 'nbs' | 'cest' | 'unspsc' | 'lei116';

export interface ItemJsonEmpresa {
    ncm?: string | null;
    nbs?: string | null;
    cest?: string | null;
    unspsc?: string | null;
    lei116?: string | null;
}

export interface AvaliarCamposObrigatoriosOptions {
    empresa: string | null | undefined;
    itemId: string | null | undefined;
    entry: ItemJsonEmpresa | null | undefined;
    itemMap?: Record<string, ItemJsonEmpresa> | null;
    liberados?: string[];
}

export interface ResultadoCamposObrigatorios {
    valido: boolean;
    empresa: string | null;
    itemId: string | null;
    camposFaltantes: CampoJsonEmpresa[];
    mensagem: string;
}

type RegraEmpresa = {
    ncm?: boolean;
    cestQuandoNcm?: boolean;
    lei116QuandoNbs?: boolean;
    unspsc?: boolean;
};

type CampoRegraEmpresa = keyof RegraEmpresa;

const NCM_SH_COM_CEST = `
3815.12.10 3815.12.90 3917 3918.10.00 3923.30.00 3926.30.00 4010.3 5910.00.00 4016.93.00
4823.90.9 4016.10.10 4016.99.90 5705.00.00 5903.90.00 5909.00.00 6306.1 6506.10.00
6813 7007.11.00 7007.21.00 7009.10.00 7014.00.00 7311.00.00 7320 7325 7806 8007.00.90
8301.2 8301.6 8301.7 8302.10.00 8302.30.00 8310 8407.3 8408.2 8409.9 8412.2 8413.3
8414.10.00 8414.80.1 8414.80.2 8413.91.90 8414.90.10 8414.90.3 8414.90.39 8415.2
8421.23.00 8421.29.90 8421.9 8424.10.00 8421.31.00 8421.39.20 8425.42.00 8431.10.10
8431.49.2 8433.90.90 8481.10.00 8481.2 8481.80.92 8482 8483 8484 8505.2 8507.1 8511
8512.2 8512.4 8512.90.00 8517.12.13 8518 8518.50.00 8519.81 8525.50.1 8525.60.10 8527.2
8527.21.90 8521.90.90 8529.10.90 8534.00.00 8535.3 8536.5 8536.10.00 8536.20.00 8536.4
8538 8539.1 8539.2 8544.20.00 8544.30.00 8707 8708 8714.1 8716.90.90 9026.1 9026.2
9029 9030.33.21 9031.80.40 9032.89.2 9104.00.00 9401.20.00 9401.90.90 9613.80.00 4009
4504.90.00 6812.99.10 4823.40.00 3919.10.00 3919.90.00 8708.29.99 8412.31.10
8413.19.00 8413.50.90 8413.81.00 8413.60.19 8413.70.10 8414.59.10 8414.59.90 8421.39.90
8501.10.19 8501.31.10 8504.50.00 8507.2 8507.3 8512.30.00 9032.89.8 9032.89.9 9027.10.00
4008.11.00 5601.22.19 5703.20.00 5703.30.00 5911.90.00 6903.90.99 7007.29.00 7314.50.00
7315.11.00 7315.12.10 8418.99.00 8419.5 8424.90.90 8425.49.10 8431.41.00 8501.61.00
8531.10.90 9014.10.00 9025.19.90 9025.90.10 9026.9 9032.10.10 9032.10.90 9032.20.00
8716.9 7322.90.10
2205 2208.90.00 2207.2 2208.40.00 2206.00.90 2208.20.00 2208.50.00 2208.70.00 2208.3
2206.00.10 2204 2206 2207 2208 2201.10.00 2202.90.00 2202 2106.90.10 2106.90.90 2101.2
2202.10.00 2203.00.00 2402 2403.1 2523 2710.12.59 2710.12.51 2710.19.19 2710.19.11
2710.19.2 2710.19.3 2710.19.9 2710.9 2711 2711.19.10 2711.11.00 2711.21.00 2713
3826.00.00 3403 2710.20.00 2716.00.00
4016.99.90 4417.00.10 4417.00.90 6804 8201 8202.20.00 8202.91.00 8202 8203 8204 8205
8206 8207.4 8207.6 8207.7 8207 8208 8209.00.11 8209 8211 8213 8467 9015 9017.20.00
9017.3 9017.8 9017.90.90 9025.11.90 9025.90.10 9025.19 9025.90.90
8539 8540 8504.10.00 8536.5 8543.70.99 2522 3816.00.1 3824.50.00 3214.90.00 3910 3916
3918 3919 3920 3921 3922 3924 3925.10.00 3925.9 3925.20.00 3925.30.00 3926.9 4814
6810.19.00 6811 6901.00.00 6902 6904 6905 6906.00.00 6907 6908 6910 6912.00.00 7003
7004 7005 7007.19.00 7007.29.00 7008 7016 7214.20.00 7308.90.10 7213 7217.10.90
7312 7217.2 7307 7308.30.00 7308.40.00 7308.9 7308.90.90 7310 7313.00.00 7314
7315.12.90 7315.82.00 7317 7318 7323 7324 7325 7326 7407 7411.10.10 7412 7415
7418.20.00 7607.19.90 7608 7609.00.00 7610 7615.20.00 7616 8302.41.00 8301 8307 8311 8481
2828.90.11 2828.90.19 3206.41.00 3808.94.19 3401.20.90 3402.20.00 3402 3809.91.90
3924.10.00 3924.90.00 6805.30.10 6805.30.90 2207 2208.90.00 7323.10.00 8504 8516 8535
8536 8538 7413.00.00 8544 7605 7614 8546 8547
3003 3004 3006.60.00 2936 3006.3 3002 3005 3005.10.90 4015.11.00 4015.19.00 4014.10.00
9018.31 9018.32.1 3926.90.90 9018.90.99 4823.20.9 4823.6 4813.10.00 3924 3923.2
4011.10.00 4011 4011.40.00 4011.50.00 4012.1 4012.9 4013 4013.20.00
1704.90.10 1806.31.10 1806.31.20 1806.32.10 1806.32.20 1806.90.00 1704.90.90 2009
2009.8 402.1 402.2 402.9 1901.10.20 1901.10.10 1901.10.90 1901.10.30 0401.10.10
0401.20.10 0401.40.10 0401.50.10 0401.10.90 0401.20.90 0401.40.2 0402.21.30 0402.29.30
0402.29.20 403 0403.90.00 406 0405.10.00 1517.10.00 1517.9 1516.20.00 1901.90.20
1904.10.00 1904.90.00 1905.90.90 2005.20.00 2005.9 2008.1 2103.20.10 2103.90.21
2103.90.91 2103.10.10 2103.30.10 2103.30.21 2103.90.11 2002 1704.90.90 1904.20.00
1101.00.10 1101.00.20 1901.20.00 1901.90.90 1902.30.00 1902 1902.40.00 1902.1 1905.2
1905.20.90 1905.20.10 1905.31 1905.90.20 1905.32 1905.4 1905.90.10 1905.10.00 1905.9
1507.90.11 1508 1509 1510.00.00 1512.19.11 1512.29.10 1514.1 1515.19.00 1515.29.10
1512.29.90 1517.90.10 1511 1513 1514 1515 1516 1518 1601.00.00 1602 1604 1605 206
0210.20.00 0210.99.00 1502 201 202 204 1502.10.19 1502.90.00 203 207 209 210.1 1501
710 811 2001 2004 2005 2006.00.00 2007 2008 901 902 1211.90.90 2106.90.90 903 1701.1
1701.99.00 1701.91.00 1701.91 1702 2008.19.00 2101.1 2101.2 1901.90.90 2101.11.90 2101.12.00
6911.10.10 6911.10.90 6912.00.00 3213.10.00 3916.20.00 3916.10.00 3916.9 3926.10.00
4202.1 4202.9 3926.90.90 4802.20.90 4811.90.90 4802.54.9 4802.54.99 4802.57.99
4816.20.00 4802.56.9 4802.57.9 4802.58.9 3703.10.10 3703.10.29 3703.20.00 3703.90.10
3704.00.00 4802.20.00 4810.13.90 4816.90.10 3920.20.19 4806.20.00 4810.22.90 4809
4816 4817 4820.10.00 4820.20.00 4820.30.00 4820.40.00 4820.50.00 4820.90.00 4909.00.00
9608.10.00 9608.20.00 9608.30.00 9608 4802.56 5210.59.90 7607.11.90
1211.90.90 2712.10.00 2814.20.00 2847.00.00 3006.70.00 3301 3303.00.10 3303.00.20
3304.10.00 3304.20.10 3304.20.90 3304.30.00 3304.91.00 3304.99.10 3304.99.90 3305.10.00
3305.20.00 3305.30.00 3305.90.00 3306.10.00 3306.20.00 3306.90.00 3307.10.00 3307.20.10
3307.20.90 3307.30.00 3307.90.00 3401.11.90 3401.19.00 3401.20.10 3401.30.00 4014.90.10
4014.90.90 3924.90.00 3926.90.40 3926.90.90 4202.1 4818.10.00 4818.20.00 4818.30.00
4818.90.90 9619.00.00 5601.21.90 5603.92.90 8203.20.90 8214.10.00 8214.20.00 9025.11.10
9025.19.90 9603.2 9603.21.00 9603.30.00 9605.00.00 9615 9616.20.00 3923.30.00 7010.20.00
8212.10.20 8212.20.10
7321.11.00 7321.81.00 7321.90.00 8418.10.00 8418.21.00 8418.29.00 8418.30.00 8418.40.00
8418.5 8418.69.9 8418.69.99 8418.99.00 8421.12 8421.19.90 8421.9 8422.11.00 8422.90.10
8443.31 8443.32 8443.9 8450.11.00 8450.12.00 8450.19.00 8450.2 8450.9 8451.21.00 8451.29.90
8451.9 8452.10.00 8471.3 8471.4 8471.50.10 8471.60.5 8471.60.90 8471.7 8471.9 8473.3
8504.3 8504.40.10 8504.40.40 8507.80.00 8508 8509 8509.80.10 8516.10.00 8516.40.00
8516.50.00 8516.60.00 8516.71.00 8516.72.00 8516.79 8516.90.00 8517.11.00 8517.12.3
8517.12 8517.18.9 8517.62.5 8518 8519 8522 8527.1 8519.81.90 8521.90.10 8521.90.90
8523.51.10 8523.52.00 8525.80.2 8527.9 8528.49.29 8528.59.20 8528.69 8528.61.00 8528.51.20
8528.7 9006.1 9006.40.00 9018.90.50 9019.10.00 9032.89.11 9504.50.00 8517.62.1
8517.62.22 8517.62.39 8517.62.4 8517.62.62 8517.62.9 8517.70.21 8214.90 8510 8414.5
8414.59.90 8414.60.00 8414.90.20 8415.1 8415.8 8415.10.11 8415.10.19 8415.10.90
8415.90.10 8415.90.20 8421.21.00 8424.30.10 8424.30.90 8424.90.90 8467.21.00 8516.2
8516.31.00 8516.32.00 8527 8479.60.00 8415.90.90 8525.80.19 8423.10.00 8540 8517
8529 8531 8531.1 8531.80.00 8534 8541.40.11 8541.40.21 8541.40.22 8543.70.92 9030.3
9030.89 9107 9405 2309 2105 1806 1901 2106 3208 3209 3210 2821 3204.17.00 3206
8711 7009 7013 7013.37.00 7013.42.90
`;

const NCM_SH_COM_CEST_NORMALIZADOS = [...new Set(
    NCM_SH_COM_CEST
        .split(/\s+/)
        .map((valor) => valor.replace(/\D/g, ''))
        .filter(Boolean),
)];

const EMPRESAS_NCM = [
    '3RPETROLEUM', 'ACCOR', 'ACECO', 'AÇOTEL', 'AES', 'AGRARIA', 'AGRICOLA FAMOSA', 'AGROGALAXY',
    'AGROVALE', 'ALBIOMA', 'ALCOA', 'ALGAFARMING', 'ALPEK', 'AMYRIS', 'ANGLOS', 'ANGRIVEST',
    'APPLUS', 'ARDAGH', 'ATERPA', 'AURAMINERALS', 'AZUL', 'AYOSHI', 'BAHIAGAS', 'BAHIANA',
    'BAYER', 'BAYER SEMENTES', 'BBA', 'BBTS', 'BELEM BIOENERGIA', 'BENEL', 'BEMISA', 'BERNEK',
    'BIOAROEIRA', 'BIONOVIS', 'BONDINHO', 'BOPAPER', 'BRASILATA', 'BRISANET', 'BRK', 'BRZ', 'BSM',
    'C&C', 'CAM', 'CAMPRO', 'CARMO ENERGY', 'CARMOENERGY', 'CARTA FABRIL', 'CBO', 'CBC', 'CBL',
    'CEDRO', 'CEI', 'CATTALINI', 'CITROSUCO', 'CMAA', 'CINPAL', 'CMOC', 'CONNECTOWAY', 'CONTOUR',
    'COPEL', 'COTY', 'COTY(CANCELOU)', 'CRASA', 'CRISTAL EMBALAGEM', 'CRM', 'CSP', 'CTG', 'CTG-P',
    'DPSP', 'DUAS RODAS', 'DUKE', 'ECO ENERGIA', 'ECORODOVIAS', 'EDP', 'ELCANO', 'ELECNOR', 'ELFSM',
    'ELETROBRAS', 'EQUATORIAL ENERGIA', 'ESM', 'EXPRESSO SÃO MIGUEL', 'ESM(EXPRESSO SÃO MIGUEL)',
    'ETEX-GYPSUM', 'FABER CASTEL', 'FERROPORT', 'FIEP', 'FIEPE', 'FORMITEX', 'FORTLEV', 'FORACO',
    'FS', 'FURUKAWA', 'GARBUIO', 'GDM', 'GEOPAR', 'GILBARCO', 'GM', 'GNA', 'GRAPHCOA', 'GREEN4T',
    'GSINIMA', 'GS INIMA', 'GRUPO BARIGUI', 'GRUPODECIO', 'GRUPOPROGRESSO', 'GRUPO SADA',
    'GRUPO SCHEFFER', 'GRUPO WEBLER', 'GTM', 'GVR', 'GSM', 'HIDROVIAS', 'HOCHSCHILD', 'INSOLO',
    'ICONIC', 'INTERCEMENT', 'IRANI', 'ITAIPU', 'JDEMITO', 'JOTABASSO', 'KALMAR', 'KAROON', 'KINROSS',
    'KRONA', 'LHOIST', 'LAGOA SANTA', 'LARGOINC', 'LEAGOLD/BRIO', 'LEBES', 'LOCALFRIO', 'LOGIN',
    'LUNDIN', 'M DIAS BRANCO', 'MACENGENHARIA', 'MAC ENG.', 'MAC ENG', 'MARISTA', 'MERCADO LIBRE',
    'MEZENERGIA', 'METASA', 'MINERAÇÃO CARAIBA', 'MILPLAN', 'MI ELECTRIC', 'MIP', 'MIRABELA', 'MMI',
    'MODEC', 'MRN', 'MRNV6', 'MRNv6', 'MULTILIXO', 'MVV', 'NORSUL', 'NOVELIS', 'NTS', 'NPE', 'NX GOLD',
    'OCEAN PACT', 'OCEANICA', 'OCYAN-TK', 'ODONTOPREV', 'OLEOPLAN', 'ONNO LOG', 'OOG', 'ORIGEM',
    'ORIZON', 'ORTOBOM', 'OXITENO', 'OZ MINERALS', 'OWENS', 'PAGOLD', 'PAGUE MENOS', 'PARAIBUNA',
    'PATENSE', 'PETROBRAS', 'PETRORECONCAVO', 'PETRORIO', 'PLANATERRA', 'POSIDONIA', 'POTENCIAL',
    'PRO NOVA', 'RECH', 'REFRAMAX', 'RIO ENERGY', 'RIOSULENSE', 'RNP', 'RODONAVES', 'SABESP', 'SAE',
    'SANTHER', 'SARAH', 'SCALA', 'SB ALIMENTOS', 'SB ALIMENTOS(CANCELOU)', 'SBM OFFSHORE DO BRASIL LTDA',
    'SHOULDER', 'SCHULZ COMPRESSORES', 'SIEMENS ENERGY', 'SER EDUCACIONAL', 'SGB', 'SOIN', 'SLC',
    'SUMITOMO', 'SUPER GASBRAS', 'SUPERVIA', 'SYMRISE', 'TAM', 'TANAC', 'TEMA', 'TEGMA', 'TERNIUM',
    'THECNIP', 'THYSSENKRUPP', 'TIROL', 'TRAMONTINA', 'TRANSPES', 'TRES CORAÇÕES', 'UMICORE', 'UNIGEL',
    'UNIVERSAL', 'USINA SANTA VITORIA', 'VALE', 'VALID', 'VAXXINOVA', 'VERO', 'VERACEL', 'VERDEFORTE',
    'VERENE', 'VETORIAL', 'VILARES METALS', 'VOESTALPINE', 'VOPAK', 'WHB', 'WOBBEN', 'WOODBRIDGE',
    'WILSON SONS', 'YAMANA', 'ZILOR', 'ZORTEA',
];

const EMPRESAS_LEI116_QUANDO_NBS = [
    '3RPETROLEUM', 'ACCOR', 'ACECO', 'AÇOTEL', 'AES', 'AGRICOLA FAMOSA', 'AGROGALAXY', 'AGROVALE',
    'ALCOA', 'ALPEK', 'AMYRIS', 'APPLUS', 'ARDAGH', 'ATERPA', 'AURAMINERALS', 'AZUL', 'AYOSHI',
    'BAYER SEMENTES', 'BBA', 'BELEM BIOENERGIA', 'BENEL', 'BEMISA', 'BERNEK', 'BIOAROEIRA', 'BIONOVIS',
    'BOPAPER', 'BRISANET', 'BRK', 'BRZ', 'BSM', 'C&C', 'CAM', 'CAMPRO', 'CARMO ENERGY', 'CARMOENERGY',
    'CARTA FABRIL', 'CBC', 'CBL', 'CEDRO', 'CATTALINI', 'CITROSUCO', 'CMAA', 'CINPAL', 'CONNECTOWAY',
    'CONTOUR', 'COPEL', 'COTY', 'COTY(CANCELOU)', 'CRASA', 'CTG-P', 'DPSP', 'DUAS RODAS', 'ECORODOVIAS',
    'EDP', 'ELCANO', 'ELECNOR', 'ELFSM', 'ELETROBRAS', 'EQUATORIAL ENERGIA', 'ESM', 'EXPRESSO SÃO MIGUEL',
    'ESM(EXPRESSO SÃO MIGUEL)', 'ETEX-GYPSUM', 'FABER CASTEL', 'FIEP', 'FIEPE', 'FORMITEX', 'FORACO',
    'FS', 'FURUKAWA', 'GARBUIO', 'GDM', 'GEOPAR', 'GILBARCO', 'GNA', 'GREEN4T', 'GSINIMA', 'GS INIMA',
    'GRUPO BARIGUI', 'GRUPODECIO', 'GRUPOPROGRESSO', 'GRUPO SADA', 'GRUPO SCHEFFER', 'GRUPO WEBLER',
    'GVR', 'GSM', 'HIDROVIAS', 'HOCHSCHILD', 'INTERCEMENT', 'IRANI', 'ITAIPU', 'JDEMITO', 'KALMAR',
    'KAROON', 'KRONA', 'LHOIST', 'LAGOA SANTA', 'LARGOINC', 'LOCALFRIO', 'M DIAS BRANCO', 'MACENGENHARIA',
    'MAC ENG.', 'MAC ENG', 'MARISTA', 'MERCADO LIBRE', 'MEZENERGIA', 'METASA', 'MINERAÇÃO CARAIBA',
    'MILPLAN', 'MI ELECTRIC', 'MIP', 'MMI', 'MRN', 'MRNV6', 'MRNv6', 'MULTILIXO', 'NPE', 'NX GOLD',
    'OCEAN PACT', 'OCEANICA', 'OCYAN-TK', 'ODONTOPREV', 'OLEOPLAN', 'ONNO LOG', 'OOG', 'ORIGEM', 'ORIZON',
    'OXITENO', 'OZ MINERALS', 'OWENS', 'PAGOLD', 'PAGUE MENOS', 'PARAIBUNA', 'PATENSE', 'PETROBRAS',
    'PETRORECONCAVO', 'PETRORIO', 'PLANATERRA', 'POSIDONIA', 'POTENCIAL', 'PRO NOVA', 'REFRAMAX',
    'RIO ENERGY', 'RIOSULENSE', 'RNP', 'RODONAVES', 'SABESP', 'SAE', 'SANTHER', 'SARAH', 'SCALA',
    'SB ALIMENTOS', 'SB ALIMENTOS(CANCELOU)', 'SBM OFFSHORE DO BRASIL LTDA', 'SHOULDER',
    'SCHULZ COMPRESSORES', 'SIEMENS ENERGY', 'SER EDUCACIONAL', 'SGB', 'SUMITOMO', 'SUPER GASBRAS',
    'SUPERVIA', 'SYMRISE', 'TAM', 'TANAC', 'TEMA', 'TEGMA', 'TERNIUM', 'THECNIP', 'THYSSENKRUPP',
    'TIROL', 'TRAMONTINA', 'TRANSPES', 'UMICORE', 'UNIGEL', 'UNIVERSAL', 'USINA SANTA VITORIA', 'VALID',
    'VAXXINOVA', 'VERO', 'VERACEL', 'VERDEFORTE', 'VERENE', 'VETORIAL', 'VILARES METALS', 'VOESTALPINE',
    'VOPAK', 'WHB', 'WOBBEN', 'WOODBRIDGE', 'ZILOR',
];

const EMPRESAS_UNSPSC = [
    '3RPETROLEUM', 'ACCOR', 'AGRICOLA FAMOSA', 'AGROVALE', 'ALCOA', 'ALGAFARMING', 'ALPEK', 'AMYRIS',
    'ANGLOS', 'ANGRIVEST', 'APPLUS', 'ATERPA', 'AZUL', 'BAYER SEMENTES', 'BBTS', 'BELEM BIOENERGIA',
    'BENEL', 'BIOAROEIRA', 'BOPAPER', 'BRADESCO', 'BRASILATA', 'BRISANET', 'BRZ', 'C&C', 'CAM', 'CAMPRO',
    'CBL', 'CATTALINI', 'CINPAL', 'CONTOUR', 'COOPERCITRUS', 'COPEL', 'COTY', 'COTY(CANCELOU)',
    'DUAS RODAS', 'ECO ENERGIA', 'ELCANO', 'ELECNOR', 'EQUATORIAL ENERGIA', 'ETEX-GYPSUM', 'FERROPORT',
    'FORMITEX', 'FORACO', 'FS', 'FURUKAWA', 'GARBUIO', 'GDM', 'GEOPAR', 'GILBARCO', 'GRUPODECIO',
    'GRUPOPROGRESSO', 'GRUPO SADA', 'GSM', 'HOCHSCHILD', 'ITAIPU', 'JDEMITO', 'KINROSS', 'LHOIST',
    'LEAGOLD/BRIO', 'M DIAS BRANCO', 'MACENGENHARIA', 'MAC ENG.', 'MAC ENG', 'MARISTA', 'MERCADO LIBRE',
    'MINERAÇÃO CARAIBA', 'MILPLAN', 'MODEC', 'MODEC GHANA', 'MOSAIC', 'MRN', 'MRNV6', 'MRNv6', 'NX GOLD',
    'ODONTOPREV', 'OOG', 'ORIGEM', 'ORIZON', 'ORTOBOM', 'OXITENO', 'OZ MINERALS', 'PAGUE MENOS',
    'PETROBRAS', 'PETRORIO', 'PLANATERRA', 'POTENCIAL', 'RECH', 'RESIA', 'RIO ENERGY', 'RNP', 'SARAH',
    'SCALA', 'SBM OFFSHORE DO BRASIL LTDA', 'SIEMENS', 'SIEMENS ENERGY', 'SOIN', 'SUPERVIA', 'TDK', 'TEMA',
    'TEGMA', 'TERNIUM', 'THECNIP', 'TIGRE', 'TRAMONTINA', 'TRANSPES', 'UMICORE', 'UNIGEL', 'VALID',
    'VAXXINOVA', 'VERACEL', 'VERDEFORTE', 'VERENE', 'VILARES METALS', 'VOESTALPINE', 'VOPAK', 'WOODBRIDGE',
];

const EMPRESAS_CEST_QUANDO_NCM = [
    'ACCOR', 'ACECO', 'AZUL', 'DPSP', 'EDP', 'ELFSM', 'GREEN4T', 'GRUPODECIO', 'LEBES', 'M DIAS BRANCO',
    'PAGOLD', 'RODONAVES', 'SABESP', 'SAE', 'SANTHER', 'TAM', 'TANAC', 'TEMA', 'TEGMA', 'TRAMONTINA',
    'ZORTEA',
];

function aplicarCampoRegra(registro: Record<string, RegraEmpresa>, empresas: string[], campo: CampoRegraEmpresa): void {
    for (const empresa of empresas) {
        const empresaNorm = normalizarEmpresa(empresa);
        if (!empresaNorm) continue;
        registro[empresaNorm] = { ...(registro[empresaNorm] || {}), [campo]: true };
    }
}

function criarRegrasEmpresa(): Record<string, RegraEmpresa> {
    const regras: Record<string, RegraEmpresa> = {};
    aplicarCampoRegra(regras, EMPRESAS_NCM, 'ncm');
    aplicarCampoRegra(regras, EMPRESAS_LEI116_QUANDO_NBS, 'lei116QuandoNbs');
    aplicarCampoRegra(regras, EMPRESAS_UNSPSC, 'unspsc');
    aplicarCampoRegra(regras, EMPRESAS_CEST_QUANDO_NCM, 'cestQuandoNcm');
    return regras;
}

function normalizarEspacosLocal(valor: unknown): string {
    return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

function normalizarEmpresa(valor: unknown): string | null {
    const raw = normalizarEspacosLocal(valor);
    if (!raw) return null;
    return raw.toUpperCase();
}

const REGRAS_EMPRESA: Record<string, RegraEmpresa> = criarRegrasEmpresa();

function temValor(valor: unknown): boolean {
    return String(valor ?? '').trim() !== '';
}

function normalizarNcmSh(valor: unknown): string {
    return String(valor ?? '').replace(/\D/g, '');
}

export function ncmTemCestCompativel(ncm: unknown): boolean {
    const ncmNorm = normalizarNcmSh(ncm);
    if (!ncmNorm) return false;
    return NCM_SH_COM_CEST_NORMALIZADOS.some((padrao) => ncmNorm.startsWith(padrao));
}

function loteNaoTrouxeNenhumCest(entry: ItemJsonEmpresa, itemMap?: Record<string, ItemJsonEmpresa> | null): boolean {
    const entries = itemMap ? Object.values(itemMap) : [entry];
    return !entries.some((item) => temValor(item?.cest));
}

function labelCampo(campo: CampoJsonEmpresa): string {
    if (campo === 'ncm') return 'NCM';
    if (campo === 'nbs') return 'NBS';
    if (campo === 'cest') return 'CEST';
    if (campo === 'unspsc') return 'UNSPSC';
    return 'Lei 116';
}

function montarMensagem(empresa: string, itemId: string | null, campos: CampoJsonEmpresa[], entry: ItemJsonEmpresa): string {
    const labels = campos.map(labelCampo).join(', ');
    const contexto = campos.includes('cest') && temValor(entry.ncm)
        ? ' para item com NCM no JSON'
        : campos.includes('lei116') && temValor(entry.nbs)
            ? ' para serviço com NBS no JSON'
            : '';
    const item = itemId ? ` do item ${itemId}` : '';
    return `${empresa} exige ${labels}${contexto}${item}. Continuar mesmo assim?`;
}

export function obterEmpresaAtual(): string | null {
    let el = buscarElementoDeep('#lblUsuario') || document.querySelector('#lblUsuario');
    if (!el && typeof window !== 'undefined' && window.top) {
        try {
            el = window.top.document.querySelector('#lblUsuario');
        } catch { /* ignore cross-origin */ }
    }
    if (el) {
        const raw = normalizarEspacosLocal(el.textContent || '');
        if (raw) {
            const parts = raw.split('//').map((p) => normalizarEmpresa(p)).filter(Boolean);
            return parts.length >= 2 ? parts[1] : normalizarEmpresa(raw);
        }
    }
    const infoSin = document.querySelector('#Label_infoSIN');
    if (infoSin) {
        const match = infoSin.textContent?.match(/Empresa:\s*(.+)$/i);
        if (match && match[1]) {
            return normalizarEmpresa(match[1].trim());
        }
    }
    return null;
}

/**
 * Retorna se a empresa atual exige UNSPSC.
 *
 * `null` representa que a empresa ainda não pôde ser identificada; nesse caso
 * o workflow mantém o comportamento configurado pelo usuário.
 */
export function empresaExigeUnspsc(empresa?: unknown): boolean | null {
    const empresaNorm = normalizarEmpresa(empresa === undefined ? obterEmpresaAtual() : empresa);
    if (!empresaNorm) return null;
    return REGRAS_EMPRESA[empresaNorm]?.unspsc === true;
}

export function avaliarCamposObrigatoriosJsonEmpresa({
    empresa,
    itemId,
    entry,
    itemMap,
    liberados = [],
}: AvaliarCamposObrigatoriosOptions): ResultadoCamposObrigatorios {
    const empresaNorm = normalizarEmpresa(empresa);
    const itemNorm = normalizarEspacosLocal(itemId) || null;
    const regra = empresaNorm ? REGRAS_EMPRESA[empresaNorm] : null;
    const dados = entry || {};
    if (!empresaNorm || !regra || !entry) {
        return { valido: true, empresa: empresaNorm, itemId: itemNorm, camposFaltantes: [], mensagem: '' };
    }

    const liberadosSet = new Set(liberados);
    const faltantes: CampoJsonEmpresa[] = [];
    const pareceServico = temValor(dados.nbs) || temValor(dados.lei116);

    if (regra.ncm && !pareceServico && !temValor(dados.ncm) && !liberadosSet.has('ncm')) {
        faltantes.push('ncm');
    }
    if (regra.cestQuandoNcm && loteNaoTrouxeNenhumCest(dados, itemMap) && ncmTemCestCompativel(dados.ncm) && !temValor(dados.cest) && !liberadosSet.has('cest')) {
        faltantes.push('cest');
    }
    if (regra.lei116QuandoNbs && temValor(dados.nbs) && !temValor(dados.lei116) && !liberadosSet.has('lei116')) {
        faltantes.push('lei116');
    }
    if (regra.unspsc && !temValor(dados.unspsc) && !liberadosSet.has('unspsc')) {
        faltantes.push('unspsc');
    }

    return {
        valido: faltantes.length === 0,
        empresa: empresaNorm,
        itemId: itemNorm,
        camposFaltantes: faltantes,
        mensagem: faltantes.length ? montarMensagem(empresaNorm, itemNorm, faltantes, dados) : '',
    };
}
