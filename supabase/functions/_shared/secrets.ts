// deno-lint-ignore-file no-explicit-any
/// <reference lib="deno.window" />

/**
 * Secrets validation utilities for edge functions
 * Ensures required secrets are present and valid at runtime
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that a secret value is not a placeholder and is set
 */
function isValidSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  // Reject common placeholder patterns
  if (value.includes("placeholder") || value.includes("your-")) return false;
  if (value.includes("REPLACE_WITH")) return false;
  return true;
}

/**
 * Validate all required secrets for the application
 * Returns validation result with any errors
 */
export function validateRequiredSecrets(): ValidationResult {
  const errors: string[] = [];

  // Supabase credentials (required for all functions)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!isValidSecret(supabaseUrl)) {
    errors.push("SUPABASE_URL is not configured or is a placeholder");
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? 
                         Deno.env.get("SERVICE_ROLE_KEY");
  if (!isValidSecret(serviceRoleKey)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is not configured or is a placeholder");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate secrets required for API key encryption
 * Returns validation result with any errors
 */
export function validateEncryptionSecrets(): ValidationResult {
  const errors: string[] = [];

  const keyEncryptionSecret = Deno.env.get("KEY_ENCRYPTION_SECRET");
  if (!isValidSecret(keyEncryptionSecret)) {
    errors.push(
      "KEY_ENCRYPTION_SECRET is not configured or is a placeholder. API key encryption is disabled."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all application secrets and return a comprehensive result
 * Includes both required and optional secrets
 */
export function validateAllSecrets(): ValidationResult {
  const errors: string[] = [];

  // Required secrets
  const requiredValidation = validateRequiredSecrets();
  errors.push(...requiredValidation.errors);

  // Optional but recommended secrets
  const encryptionValidation = validateEncryptionSecrets();
  if (encryptionValidation.errors.length > 0) {
    console.warn("Warning:", encryptionValidation.errors.join("; "));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Assert that required secrets are valid, throw error if not
 * Use at the start of critical edge functions
 */
export function assertSecretsValid(): void {
  const result = validateRequiredSecrets();
  if (!result.valid) {
    throw new Error(
      `Secret validation failed: ${result.errors.join("; ")} - Please configure environment secrets before deploying.`
    );
  }
}
