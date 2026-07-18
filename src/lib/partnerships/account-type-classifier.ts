/**
 * Partnerships discovery · clasificador influencer-vs-empresa (SAN-480)
 *
 * Módulo PURO (sin Node, sin red): decide si un perfil de Instagram es una
 * cuenta de creador/influencer o la cuenta de una empresa (clínica, tienda,
 * marca...). ScrapeCreators trae `category_name` (autoelegida y ambigua, p.ej.
 * "Health/beauty") e `is_business_account`/`is_professional_account`, pero
 * ninguna de esas señales decide sola: el veredicto combina categoría, tokens
 * de identidad (username/nombre), voz de la bio y los flags de la cuenta.
 *
 * Regla de producto: las médicas/dermatólogas creadoras ("dra.", "dr.") son
 * CREATOR salvo señales claras de organización (clínica, "somos", reservas...).
 * En la duda el veredicto es "ambiguous": no se descarta, se marca a revisar.
 */

import type { RawDiscoveryCandidate } from "./discovery-types";

export type AccountTypeVerdict = "creator" | "business" | "ambiguous";

export interface AccountTypeProfile {
  /** Handle sin @ (se tolera con @). */
  username?: string;
  fullName?: string;
  biography?: string;
  /** `category_name` de ScrapeCreators (autoelegida por la cuenta). */
  categoryName?: string;
  /** Flag `is_business_account` del perfil (si el proveedor lo trae). */
  isBusinessAccount?: boolean;
  /** Flag `is_professional_account` del perfil (creator o business). */
  isProfessionalAccount?: boolean;
  followers?: number;
}

export interface AccountTypeClassification {
  verdict: AccountTypeVerdict;
  /** Señales que sostienen el veredicto, en es-ES, para notas visibles. */
  reasons: string[];
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Token de identidad en handles/nombres compuestos: basta un límite de palabra
 * a UN lado ("ventapelucas" casa "venta" al inicio y "pelucas" al final;
 * "remindhairclinics" casa "clinics"; "aventura" NO casa "venta").
 */
function hasIdentityToken(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  const escaped = escapeRegExp(token);
  return (
    new RegExp(`(^|[^a-z])${escaped}`).test(haystack) ||
    new RegExp(`${escaped}([^a-z]|$)`).test(haystack)
  );
}

/**
 * Frase/palabra completa en texto con separadores reales (bios): límites a
 * AMBOS lados ("sede en Madrid" casa "sede"; "sedentario" no).
 */
function hasPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  const escaped = escapeRegExp(phrase);
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack);
}

/** Categorías que solo usan cuentas de negocio (no personas). */
const BUSINESS_CATEGORIES = [
  "clinica",
  "clinic",
  "hospital",
  "centro medico",
  "medical center",
  "medical & health",
  "tienda",
  "shop",
  "store",
  "producto/servicio",
  "product/service",
  "empresa",
  "company",
  "negocio local",
  "local business",
  "e-commerce",
  "ecommerce",
  "marca",
  "brand",
  "agencia",
  "agency",
  "peluqueria",
  "hair salon",
  "salon de belleza",
  "beauty salon",
  "beauty, cosmetic & personal care",
  "cosmetica",
  "cosmetics",
  "spa",
  "farmacia",
  "pharmacy",
  "inmobiliaria",
  "real estate",
  "restaurante",
  "restaurant",
  "hotel",
];

/** Categorías que solo usan personas creadoras. */
const CREATOR_CATEGORIES = [
  "creador de contenido",
  "creadora de contenido",
  "digital creator",
  "creador digital",
  "video creator",
  "blogger",
  "blog personal",
  "personal blog",
  "figura publica",
  "public figure",
  "artista",
  "artist",
  "influencer",
  "escritor",
  "writer",
  "atleta",
  "athlete",
  "deportista",
];

/** Tokens de organización en username/nombre: nadie se llama así de persona. */
const ORG_IDENTITY_TOKENS = [
  "clinica",
  "clinicas",
  "clinic",
  "clinics",
  "hospital",
  "hospitales",
  "instituto",
  "institute",
  "farmacia",
  "pharmacy",
  "tienda",
  "shop",
  "store",
  "boutique",
  "pelucas",
  "wigs",
  "venta",
  "ventas",
  "grupo",
  "group",
  "corporacion",
  "franquicia",
];

/** Formas legales en nombre o bio. */
const LEGAL_FORM_PATTERN =
  /(^|[^a-z])(s\.?l\.?u?\.?|s\.?a\.?|ltd|llc|inc|gmbh|s\.?l\.?)([^a-z]|$)/;

/** Voz corporativa: primera persona del plural / marketing de empresa. */
const CORPORATE_VOICE_PHRASES = [
  "somos",
  "nuestro equipo",
  "nuestra clinica",
  "nuestras clinicas",
  "nuestros centros",
  "nuestra tienda",
  "nuestros clientes",
  "nuestros pacientes",
  "expertos en",
  "especialistas en",
  "lideres en",
  "te ayudamos",
  "te asesoramos",
  "trabajamos",
  "ofrecemos",
];

/** Operativa de negocio: reservas, ventas, envíos, sedes, horarios. */
const BUSINESS_OPS_PHRASES = [
  "pide cita",
  "pide tu cita",
  "reserva tu cita",
  "reserva cita",
  "cita previa",
  "solicita tu cita",
  "primera consulta",
  "consulta gratuita",
  "diagnostico gratuito",
  "diagnostico gratis",
  "atencion al cliente",
  "envios",
  "envio gratis",
  "entrega en 24",
  "pedidos",
  "compra online",
  "tienda online",
  "showroom",
  "sucursal",
  "sucursales",
  "sede",
  "sedes",
  "horario",
  "franquicia",
  "distribuidor",
  "mayorista",
  "financiacion",
  "presupuesto sin compromiso",
];

/** Escala de organización en la bio: "más de 90 clínicas/centros/tiendas". */
const ORG_SCALE_PATTERN =
  /\d+\s+(clinicas|centros|tiendas|sedes|sucursales|locales|hospitales)/;

/** Voz de creador: primera persona del singular / divulgación. */
const CREATOR_VOICE_PHRASES = [
  "soy ",
  "te enseno",
  "te ayudo",
  "te cuento",
  "te explico",
  "comparto",
  "hablo de",
  "divulgo",
  "divulgacion",
  "mi experiencia",
  "mi historia",
  "mi pelo",
  "mi cabello",
  "mi dia a dia",
  "creadora de contenido",
  "creador de contenido",
  "content creator",
  "mama de",
  "papa de",
];

/** Títulos de persona (profesionales sanitarias creadoras incluidas). */
const PERSON_TITLE_TOKENS = [
  "dra",
  "dr",
  "doctora",
  "doctor",
  "dermatologa",
  "dermatologo",
  "tricologa",
  "tricologo",
  "nutricionista",
  "farmaceutica",
  "farmaceutico",
  "fisioterapeuta",
  "psicologa",
  "psicologo",
  "enfermera",
  "enfermero",
];

function looksLikePersonName(fullName: string | undefined): boolean {
  const raw = (fullName ?? "")
    // Fuera emojis/símbolos; conservamos letras (con acentos), espacios y puntos.
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return false;
  const words = raw.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  const normalized = normalizeText(raw);
  if (ORG_IDENTITY_TOKENS.some((token) => hasIdentityToken(normalized, token))) {
    return false;
  }
  // Al menos una palabra alfabética de 2+ letras con forma de nombre propio.
  return words.some((word) => /^\p{L}{2,}$/u.test(word.replace(/[.'-]/g, "")));
}

export function classifyAccountType(
  profile: AccountTypeProfile,
): AccountTypeClassification {
  const username = normalizeText(profile.username).replace(/^@+/, "");
  const fullName = normalizeText(profile.fullName);
  const biography = normalizeText(profile.biography);
  const category = normalizeText(profile.categoryName);
  const identity = `${username} ${fullName}`.trim();

  const businessStrong: string[] = [];
  const businessWeak: string[] = [];
  const creatorStrong: string[] = [];
  const creatorWeak: string[] = [];

  const businessCategory = BUSINESS_CATEGORIES.find((entry) =>
    category.includes(entry),
  );
  if (businessCategory) {
    businessStrong.push(
      `categoría de negocio ("${profile.categoryName?.trim()}")`,
    );
  }
  const creatorCategory = CREATOR_CATEGORIES.find((entry) =>
    category.includes(entry),
  );
  if (creatorCategory) {
    creatorStrong.push(`categoría de creador ("${profile.categoryName?.trim()}")`);
  }

  const orgToken = ORG_IDENTITY_TOKENS.find((token) =>
    hasIdentityToken(identity, token),
  );
  if (orgToken) {
    businessStrong.push(`nombre/usuario de organización ("${orgToken}")`);
  }
  if (LEGAL_FORM_PATTERN.test(fullName) || LEGAL_FORM_PATTERN.test(biography)) {
    businessStrong.push("forma legal de sociedad (S.L./S.A./Ltd)");
  }
  const corporateVoice = CORPORATE_VOICE_PHRASES.filter((phrase) =>
    biography.includes(phrase),
  );
  if (corporateVoice.length > 0) {
    businessStrong.push(`bio con voz corporativa ("${corporateVoice[0]}")`);
  }
  const opsPhrases = BUSINESS_OPS_PHRASES.filter((phrase) =>
    hasPhrase(biography, phrase),
  );
  if (opsPhrases.length >= 2) {
    businessStrong.push(
      `operativa de negocio en la bio (${opsPhrases.slice(0, 3).join(", ")})`,
    );
  } else if (opsPhrases.length === 1) {
    businessWeak.push(`mención comercial en la bio ("${opsPhrases[0]}")`);
  }
  if (ORG_SCALE_PATTERN.test(biography)) {
    businessStrong.push("la bio presume de número de sedes/clínicas/tiendas");
  }
  if (profile.isBusinessAccount === true) {
    businessWeak.push("cuenta marcada como empresa en Instagram");
  }

  const creatorVoice = CREATOR_VOICE_PHRASES.filter((phrase) =>
    biography.includes(phrase),
  );
  if (creatorVoice.length > 0) {
    creatorStrong.push(
      `bio en primera persona ("${creatorVoice[0].trim()}")`,
    );
  }
  const personTitle = PERSON_TITLE_TOKENS.find((token) =>
    hasPhrase(identity, token),
  );
  if (personTitle) {
    creatorWeak.push(`título profesional de persona ("${personTitle}")`);
  }
  if (looksLikePersonName(profile.fullName)) {
    creatorWeak.push("el nombre del perfil parece de persona");
  }
  if (
    profile.isProfessionalAccount === true &&
    profile.isBusinessAccount === false
  ) {
    creatorWeak.push("cuenta profesional tipo creador (no empresa)");
  }

  if (businessStrong.length >= 1 && creatorStrong.length === 0) {
    return { verdict: "business", reasons: businessStrong.concat(businessWeak) };
  }
  if (businessStrong.length >= 2) {
    return { verdict: "business", reasons: businessStrong.concat(businessWeak) };
  }
  if (businessStrong.length === 1 && creatorStrong.length >= 1) {
    return {
      verdict: "ambiguous",
      reasons: businessStrong.concat(creatorStrong),
    };
  }
  if (creatorStrong.length >= 1) {
    return { verdict: "creator", reasons: creatorStrong.concat(creatorWeak) };
  }
  // Solo señales débiles a ambos lados. Un flag de empresa o una mención
  // comercial sin evidencia de PERSONA (título profesional) no descarta, pero
  // tampoco pasa limpio: queda marcado para revisión manual. La forma del
  // nombre no cuenta aquí — "Capilar Bienestar" también parece nombre propio.
  if (businessWeak.length >= 1 && !personTitle) {
    return {
      verdict: "ambiguous",
      reasons: businessWeak.concat(creatorWeak),
    };
  }
  return {
    verdict: "creator",
    reasons:
      creatorWeak.length > 0
        ? creatorWeak
        : ["sin señales de cuenta de empresa"],
  };
}

/**
 * Clasifica un candidato ya normalizado de discovery. La bio y la categoría
 * viajan en `customVariables` (`biografia`/`categoria`, campos literales del
 * proveedor) y los flags de cuenta en `candidate.account`.
 */
export function classifyCandidateAccountType(
  candidate: RawDiscoveryCandidate,
): AccountTypeClassification {
  return classifyAccountType({
    username: candidate.handle.replace(/^@/, ""),
    ...(candidate.name ? { fullName: candidate.name } : {}),
    ...(candidate.customVariables?.biografia
      ? { biography: candidate.customVariables.biografia }
      : {}),
    ...(candidate.customVariables?.categoria
      ? { categoryName: candidate.customVariables.categoria }
      : {}),
    ...(candidate.account?.businessAccount !== undefined
      ? { isBusinessAccount: candidate.account.businessAccount }
      : {}),
    ...(candidate.account?.professionalAccount !== undefined
      ? { isProfessionalAccount: candidate.account.professionalAccount }
      : {}),
    ...(candidate.followers !== undefined
      ? { followers: candidate.followers }
      : {}),
  });
}
