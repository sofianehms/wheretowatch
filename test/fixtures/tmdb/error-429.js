// Format: https://developer.themoviedb.org/docs/errors
// Reference date: 22/11/2026. This fixture is hand-written, not a recorded response.
// Synthetic error case. The probe covered successful responses.
export const status = 429;

export default { success: false, status_code: 25, status_message: 'Request rate exceeded.' };
