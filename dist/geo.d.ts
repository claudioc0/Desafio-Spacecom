/**
 * Raio médio da Terra em metros conforme especificação do desafio.
 */
export declare const EARTH_RADIUS_METERS = 6371000;
/**
 * Distância máxima estrita (em metros) para configurar um encontro físico (< 20m).
 */
export declare const MAX_ENCOUNTER_DISTANCE_METERS = 20;
/**
 * Limites para pré-filtragem espacial em ponto fixo (escala 10^5 graus):
 * - 1 grau de latitude ≈ 111.194,93 metros.
 *   Logo, 20 metros equivalem a ~0,00017986 graus = 17,986 * 10^-5 graus.
 *   Com margem de segurança, |dLatE5| > 19 garante distância > 21,1 metros.
 * - Para longitude até ±75° de latitude, |dLonE5| > 75 garante distância > 20 metros.
 */
export declare const LAT_E5_MAX_DELTA = 19;
export declare const LON_E5_MAX_DELTA = 75;
export declare const LAT_E5_DOUBLE_DELTA: number;
export declare const LON_E5_DOUBLE_DELTA: number;
/**
 * Calcula a distância geodésica em metros entre dois pontos utilizando a
 * Fórmula de Haversine com raio terrestre R = 6.371.000 metros.
 */
export declare function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
