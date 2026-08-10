export interface CaptchaChallenge { captchaKey: string; captchaImage: string; expiresIn: number }
export interface OtpRequestParams { phone: string; captchaKey?: string; captchaAnswer?: string }
export interface OtpChallenge { challengeId: string; status: string; expiresAt?: string; expiresIn?: number }
export interface AuthResult { isAnonymous: boolean; type: string | null; authenticatedAt: string | null }
