/**
 * Raio médio da Terra em metros conforme especificação do desafio.
 */
export const EARTH_RADIUS_METERS = 6_371_000;
/**
 * Distância máxima estrita (em metros) para configurar um encontro físico (< 20m).
 */
export const MAX_ENCOUNTER_DISTANCE_METERS = 20;
/**
 * Limites para pré-filtragem espacial em ponto fixo (escala 10^5 graus):
 * - 1 grau de latitude ≈ 111.194,93 metros.
 *   Logo, 20 metros equivalem a ~0,00017986 graus = 17,986 * 10^-5 graus.
 *   Com margem de segurança, |dLatE5| > 19 garante distância > 21,1 metros.
 * - Para longitude até ±75° de latitude, |dLonE5| > 75 garante distância > 20 metros.
 */
export const LAT_E5_MAX_DELTA = 19;
export const LON_E5_MAX_DELTA = 75;
export const LAT_E5_DOUBLE_DELTA = LAT_E5_MAX_DELTA * 2;
export const LON_E5_DOUBLE_DELTA = LON_E5_MAX_DELTA * 2;
/**
 * Calcula a distância geodésica em metros entre dois pontos utilizando a
 * Fórmula de Haversine com raio terrestre R = 6.371.000 metros.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLon = Math.sin(dLon / 2);
    const a = sinHalfLat * sinHalfLat +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            sinHalfLon *
            sinHalfLon;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}
