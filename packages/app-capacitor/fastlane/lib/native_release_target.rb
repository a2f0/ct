# frozen_string_literal: true

require 'dotenv'

# CT has one store app and no staging tier; the dashboard host it calls is fixed
# in vite.config.ts, so secrets files never choose it.
NATIVE_RELEASE_TARGETS = {
  'production' => {
    android_build_variant: 'release',
    app_identifier: 'net.a2f0.ct',
    capacitor_sync_script: 'cap:sync',
    ios_archive_name: 'CT.xcarchive',
    ios_configuration: 'Release',
    ios_ipa_name: 'CT.ipa',
    ios_output_directory: 'output',
    ios_scheme: 'App',
    secrets_tier: 'prod'
  }.freeze
}.freeze

NATIVE_RELEASE_TIER = ENV.fetch('NATIVE_RELEASE_TIER', 'production').strip.downcase
NATIVE_RELEASE_TARGET = NATIVE_RELEASE_TARGETS.fetch(NATIVE_RELEASE_TIER) do
  raise "Unknown NATIVE_RELEASE_TIER=#{NATIVE_RELEASE_TIER.inspect}. " \
        "Expected #{NATIVE_RELEASE_TARGETS.keys.join(' or ')}."
end
NATIVE_APP_IDENTIFIER = NATIVE_RELEASE_TARGET.fetch(:app_identifier)
NATIVE_CAPACITOR_SYNC_SCRIPT = NATIVE_RELEASE_TARGET.fetch(:capacitor_sync_script)
NATIVE_PACKAGE_DIR = File.expand_path('../..', __dir__)
NATIVE_REPO_ROOT = File.expand_path('../..', NATIVE_PACKAGE_DIR)

def native_release_tier_secrets_dir(tier)
  File.join(NATIVE_REPO_ROOT, '.secrets', NATIVE_RELEASE_TARGETS.fetch(tier).fetch(:secrets_tier))
end

# The tier reads only its own `.secrets/<secrets tier>/` folder: signing keys,
# store credentials, `shared.env` (the values shared with other projects), and
# `app.env` (this project's). NATIVE_RELEASE_SECRETS_DIR names another folder
# instead; a relative path resolves against this package, as Gradle resolves it.
NATIVE_RELEASE_SECRETS_DIR_OVERRIDE = ENV.fetch('NATIVE_RELEASE_SECRETS_DIR', '').strip
NATIVE_SECRETS_DIR =
  if NATIVE_RELEASE_SECRETS_DIR_OVERRIDE.empty?
    native_release_tier_secrets_dir(NATIVE_RELEASE_TIER)
  else
    File.expand_path(NATIVE_RELEASE_SECRETS_DIR_OVERRIDE, NATIVE_PACKAGE_DIR)
  end
NATIVE_SHARED_ENV_PATH = File.join(NATIVE_SECRETS_DIR, 'shared.env')
NATIVE_APP_ENV_PATH = File.join(NATIVE_SECRETS_DIR, 'app.env')
# Store credentials and signing passwords. Values copied from root.env stay in
# shared.env until they are rotated into app.env.
NATIVE_STORE_ENV_NAMES = %w[
  ANDROID_KEYSTORE_KEY_PASS
  ANDROID_KEYSTORE_STORE_PASS
  APP_STORE_CONNECT_ISSUER_ID
  APP_STORE_CONNECT_KEY_ID
  MATCH_GIT_BASIC_AUTHORIZATION
  MATCH_GIT_URL
  MATCH_PASSWORD
  TEAM_ID
].freeze

def native_release_android_build_variant_task
  NATIVE_RELEASE_TARGET.fetch(:android_build_variant).capitalize
end

def native_release_android_artifact_relative_paths
  variant = NATIVE_RELEASE_TARGET.fetch(:android_build_variant)
  {
    aab: "bundle/#{variant}/app-#{variant}.aab",
    mapping: "mapping/#{variant}/mapping.txt",
    native_debug_symbols: "native-debug-symbols/#{variant}/native-debug-symbols.zip"
  }.freeze
end

def native_release_ios_archive_relative_path
  File.join(
    NATIVE_RELEASE_TARGET.fetch(:ios_output_directory),
    NATIVE_RELEASE_TARGET.fetch(:ios_archive_name)
  )
end

def native_release_env_file(file_name)
  path = File.join(NATIVE_SECRETS_DIR, file_name)
  (File.file?(path) ? Dotenv.parse(path) : {}).slice(*NATIVE_STORE_ENV_NAMES)
end

# Both files also hold server values no lane needs, so each contributes only
# the allowlisted names; app.env wins over shared.env.
def native_release_file_environment
  native_release_env_file('shared.env').merge(native_release_env_file('app.env'))
end

# Load release values while preserving every variable explicitly set by the
# caller.
def load_native_release_secrets_env
  process_environment = ENV.to_h

  native_release_file_environment.each do |name, value|
    ENV[name] = value unless process_environment.key?(name)
  end
end
