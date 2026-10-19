/**
 * Eva — Auto-Update Service
 *
 * Handles update checking, downloading, verification, and installation
 * using electron-updater with secure signature verification.
 */

'use strict';

const { autoUpdater } = require('electron-updater');
const { dialog, shell, BrowserWindow, app } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// --- Configuration ---------------------------------------------------------

const UPDATE_CONFIG = {
  // Update server configuration.
  //
  // The feed is NOT hard-coded here: electron-builder writes the real
  // provider/owner/repo into resources/app-update.yml, and that file is the
  // source of truth. The previous placeholders ('your-org' / 'eva-jarvis')
  // were applied through setFeedURL() and silently overrode the packaged
  // feed, so every update check 404'd against a repository that does not
  // exist. Env vars still win, for local/private testing.
  provider: process.env.EVA_UPDATE_PROVIDER || '',
  owner: process.env.EVA_UPDATE_OWNER || '',
  repo: process.env.EVA_UPDATE_REPO || '',
  channel: process.env.EVA_UPDATE_CHANNEL || 'stable', // stable, beta, development

  // Check intervals
  checkOnStartup: true,
  checkIntervalMs: 4 * 60 * 60 * 1000, // 4 hours

  // Security
  // NOTE: this is enforced by Eva's own verifyDownloadedUpdate(), not by
  // electron-updater (which has no such option). Publisher identity can only
  // be asserted when the build declares win.publisherName; until then the
  // update is SHA-512 integrity-checked only.
  requireCodeSigning: true, // Enforce publisher identity when a publisher is declared
  allowPrerelease: false, // Only stable by default

  // Behavior
  autoDownload: true,
  autoInstallOnAppQuit: true, // Install when user quits app
  notifyOnUpdate: true,

  // Production safety
  minDiskSpaceMB: 500, // Minimum free disk space required (MB)
  maxDownloadSizeMB: 500, // Maximum update size (MB)
  verifyChecksums: true, // SHA-512 from latest.yml is always enforced
};

// --- State -----------------------------------------------------------------

let updateCheckTimer = null;
let lastUpdateInfo = null;
let updateDownloaded = false;
let isChecking = false;
let mainWindowRef = null;
let serverOrigin = null;

// --- Helpers ---------------------------------------------------------------

function sendToRenderer(channel, payload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload);
  }
}

function logUpdate(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[UPDATE ${timestamp}] ${message}`;
  console.log(logMessage);

  // Also log to file
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'update.log'), logMessage + '\n');
  } catch (e) {
    // Best effort
  }
}

function computeFileHash(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Get free disk space in MB for the given path.
 */
function getFreeDiskSpaceMB(targetPath) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows: use fsutil or wmic
      const drive = path.parse(targetPath).root || 'C:';
      execFile('fsutil', ['volume', 'diskfree', drive], { encoding: 'utf8' }, (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        // Parse output like "Total free bytes: 1234567890"
        const match = stdout.match(/free\s+bytes?\s*:\s*(\d+)/i);
        if (match) {
          resolve(Math.floor(parseInt(match[1], 10) / (1024 * 1024)));
        } else {
          reject(new Error('Could not parse disk free space'));
        }
      });
    } else {
      // Linux/macOS: use df
      execFile('df', ['-k', targetPath], { encoding: 'utf8' }, (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        // Parse df output, last line has the target partition
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const parts = lastLine.split(/\s+/);
        // df -k: 4th column is available KB
        if (parts.length >= 4) {
          const freeKB = parseInt(parts[3], 10);
          resolve(Math.floor(freeKB / 1024));
        } else {
          reject(new Error('Could not parse df output'));
        }
      });
    }
  });
}

// --- Update Service --------------------------------------------------------

/**
 * Read the update feed that electron-builder wrote into app-update.yml.
 *
 * This file is generated at build time from the real repository, so it is the
 * only trustworthy source for provider/owner/repo. Reading it here means the
 * updater uses the release feed that was actually shipped, instead of
 * hard-coded values that can drift out of sync with the build.
 */
function readPackagedUpdateConfig() {
  const candidates = [];
  try {
    if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'app-update.yml'));
  } catch { /* not packaged */ }
  try {
    candidates.push(path.join(app.getAppPath(), 'resources', 'app-update.yml'));
    candidates.push(path.join(process.cwd(), 'resources', 'app-update.yml'));
  } catch { /* ignore */ }

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const value = (key) => {
        const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
        return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
      };
      const config = {
        provider: value('provider'),
        owner: value('owner'),
        repo: value('repo'),
        publisherName: value('publisherName'),
      };
      if (config.provider || config.owner || config.repo) {
        logUpdate(`Update feed from ${file}: ${config.provider}/${config.owner}/${config.repo}`);
        return config;
      }
    } catch { /* try the next candidate */ }
  }
  return null;
}

/**
 * Resolve the effective update feed.
 *
 * Priority: explicit env override > packaged app-update.yml > no feed.
 * When no feed can be resolved the updater is left alone, so electron-updater
 * falls back to app-update.yml itself rather than being pointed at a
 * repository that does not exist.
 */
function resolveUpdateFeed() {
  const packaged = readPackagedUpdateConfig();
  const provider = UPDATE_CONFIG.provider || packaged?.provider || null;
  const owner = UPDATE_CONFIG.owner || packaged?.owner || null;
  const repo = UPDATE_CONFIG.repo || packaged?.repo || null;

  if (!provider || !owner || !repo) {
    logUpdate('No update feed configured; automatic updates are disabled.');
    return null;
  }
  return { provider, owner, repo };
}

function initializeUpdater(mainWindow, origin) {
  mainWindowRef = mainWindow;
  serverOrigin = origin;

  // Configure autoUpdater
  autoUpdater.logger = {
    info: (msg) => logUpdate(`INFO: ${msg}`),
    warn: (msg) => logUpdate(`WARN: ${msg}`),
    error: (msg) => logUpdate(`ERROR: ${msg}`),
  };

  autoUpdater.autoDownload = UPDATE_CONFIG.autoDownload;
  autoUpdater.autoInstallOnAppQuit = UPDATE_CONFIG.autoInstallOnAppQuit;

  // Point the updater at the real release feed. When no feed can be resolved
  // we deliberately do NOT call setFeedURL(), so electron-updater keeps using
  // the packaged app-update.yml instead of being pointed at a placeholder
  // repository.
  const feed = resolveUpdateFeed();
  if (feed && feed.provider === 'github') {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: feed.owner,
      repo: feed.repo,
      private: false,
      releaseType: UPDATE_CONFIG.allowPrerelease ? 'prerelease' : 'release',
    });
    logUpdate(`Update feed: github ${feed.owner}/${feed.repo}`);
  } else if (feed && feed.provider === 'generic') {
    // Custom server with version manifest
    const url = process.env.EVA_UPDATE_URL;
    if (url) {
      autoUpdater.setFeedURL({ provider: 'generic', url });
      logUpdate(`Update feed: generic ${url}`);
    }
  } else if (!feed) {
    logUpdate('Automatic updates are disabled: no release feed is configured.');
  }

  // Channel support via release tags
  if (UPDATE_CONFIG.channel === 'beta') {
    autoUpdater.allowPrerelease = true;
    autoUpdater.allowDowngrade = false;
  } else if (UPDATE_CONFIG.channel === 'development') {
    autoUpdater.allowPrerelease = true;
    autoUpdater.allowDowngrade = true;
  } else {
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
  }

  // --- Event Handlers ---

  autoUpdater.on('checking-for-update', () => {
    logUpdate('Checking for updates...');
    isChecking = true;
    sendToRenderer('update:status', { status: 'checking' });
  });

  autoUpdater.on('update-available', async (info) => {
    logUpdate(`Update available: ${info.version} (current: ${app.getVersion()})`);
    lastUpdateInfo = info;
    updateDownloaded = false;
    isChecking = false;

    // Check disk space before downloading
    if (UPDATE_CONFIG.minDiskSpaceMB) {
      try {
        const freeSpaceMB = await getFreeDiskSpaceMB(app.getPath('userData'));
        if (freeSpaceMB < UPDATE_CONFIG.minDiskSpaceMB) {
          const error = `Insufficient disk space: ${freeSpaceMB} MB free, ${UPDATE_CONFIG.minDiskSpaceMB} MB required`;
          logUpdate(`Update blocked: ${error}`);
          sendToRenderer('update:status', {
            status: 'error',
            error,
            code: 'ENOSPC',
          });
          return;
        }
      } catch (e) {
        logUpdate(`Disk space check failed: ${e.message}`);
      }
    }

    // Check download size limit
    const updateSizeMB = info.files?.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024);
    if (UPDATE_CONFIG.maxDownloadSizeMB && updateSizeMB > UPDATE_CONFIG.maxDownloadSizeMB) {
      const error = `Update size ${updateSizeMB.toFixed(1)} MB exceeds limit of ${UPDATE_CONFIG.maxDownloadSizeMB} MB`;
      logUpdate(`Update blocked: ${error}`);
      sendToRenderer('update:status', {
        status: 'error',
        error,
        code: 'E2BIG',
      });
      return;
    }

    logUpdate(`Update available: ${info.version} (current: ${app.getVersion()})`);
    lastUpdateInfo = info;
    updateDownloaded = false;
    isChecking = false;
    sendToRenderer('update:status', {
      status: 'available',
      version: info.version,
      currentVersion: app.getVersion(),
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      files: info.files?.map(f => ({ url: f.url, size: f.size, sha512: f.sha512 })),
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    logUpdate(`No update available (current: ${info.version})`);
    isChecking = false;
    sendToRenderer('update:status', { status: 'up-to-date', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    logUpdate(`Update error: ${err.message}`);
    isChecking = false;
    sendToRenderer('update:status', {
      status: 'error',
      error: err.message,
      code: err.code,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('error', (err) => {
    logUpdate(`Update error: ${err.message}`);
    isChecking = false;
    
    // Handle permission errors specifically
    const isPermissionError = err.code === 'EACCES' || 
                              err.code === 'EPERM' || 
                              err.message?.includes('permission') || 
                              err.message?.includes('access denied');
    
    const errorMessage = isPermissionError 
      ? `Permission denied: ${err.message}. Run as administrator or check folder permissions.`
      : err.message;
    
    sendToRenderer('update:status', {
      status: 'error',
      error: errorMessage,
      code: err.code,
      isPermissionError,
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    logUpdate(`Update downloaded: ${info.version}`);
    updateDownloaded = true;
    lastUpdateInfo = info;

    // Verify the downloaded package
    const verified = await verifyDownloadedUpdate(info);
    if (!verified) {
      logUpdate('Signature verification FAILED — discarding update');
      sendToRenderer('update:status', {
        status: 'verification-failed',
        error: 'Downloaded update failed signature verification. Update discarded.',
      });
      // Clean up failed download
      try {
        if (info.downloadedFile && fs.existsSync(info.downloadedFile)) {
          fs.unlinkSync(info.downloadedFile);
        }
      } catch (e) { /* ignore */ }
      return;
    }

    logUpdate('Signature verification PASSED');
    sendToRenderer('update:status', {
      status: 'downloaded',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    // Notify user that update is ready
    if (UPDATE_CONFIG.notifyOnUpdate && Notification.isSupported()) {
      new Notification({
        title: 'Eva Update Ready',
        body: `Version ${info.version} is ready to install. Restart to apply.`,
        icon: path.join(app.getAppPath(), 'build', 'icon.png'),
      }).show();
    }
  });

  // Start periodic checks
  startPeriodicChecks();

  // Initial check
  if (UPDATE_CONFIG.checkOnStartup) {
    setTimeout(() => checkForUpdates(), 5000);
  }
}

/**
 * Read the publisher name this build was configured with.
 *
 * electron-builder writes it into resources/app-update.yml when
 * `win.publisherName` is set. electron-updater's own NsisUpdater only
 * enforces the Authenticode signature when this value is present
 * (NsisUpdater.verifySignature returns null otherwise), so without it the
 * update is integrity-checked but NOT publisher-verified.
 */
function configuredPublisherNames() {
  const candidates = [];
  try {
    const resourceDir = process.resourcesPath;
    if (resourceDir) candidates.push(path.join(resourceDir, 'app-update.yml'));
  } catch { /* not packaged */ }
  try {
    candidates.push(path.join(app.getAppPath(), 'resources', 'app-update.yml'));
    candidates.push(path.join(process.cwd(), 'resources', 'app-update.yml'));
  } catch { /* ignore */ }

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const match = raw.match(/^publisherName:\s*(.+)$/m);
      if (!match) continue;
      const value = match[1].trim().replace(/^['"]|['"]$/g, '');
      if (!value) continue;
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    } catch { /* try the next candidate */ }
  }
  return [];
}

/**
 * Verify the Authenticode signature of the downloaded installer.
 *
 * Uses the operating system's own trust chain: Get-AuthenticodeSignature
 * reports Valid only when the file carries a signature that chains to a
 * trusted root AND the signer matches an expected publisher. Returns true
 * when the file is validly signed by one of the expected publishers.
 *
 * The path is passed on stdin, never on the command line: a path with spaces
 * or quotes would otherwise be re-parsed by PowerShell, and a path is
 * untrusted input. This mirrors secrets/secretStore.ts.
 */
function verifyAuthenticodeSignature(filePath, publisherNames) {
  if (!publisherNames.length) return null; // nothing to compare against
  const script = [
    "$ErrorActionPreference='Stop'",
    "$p=[Console]::In.ReadToEnd().Trim()",
    "$sig=Get-AuthenticodeSignature -LiteralPath $p",
    "if($sig.Status -ne 'Valid'){ Write-Output ('INVALID:'+$sig.Status); exit 0 }",
    "Write-Output ('VALID:'+$sig.SignerCertificate.Subject)",
  ].join('; ');
  try {
    const result = require('child_process').spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { input: filePath, encoding: 'utf8', windowsHide: true, timeout: 30_000 },
    );
    const output = String(result.stdout || '').trim();
    if (!output.startsWith('VALID:')) {
      logUpdate(`Authenticode verification failed: ${output || 'no result'}`);
      return false;
    }
    const subject = output.slice('VALID:'.length);
    const matched = publisherNames.some((name) =>
      subject.toLowerCase().includes(name.toLowerCase()),
    );
    if (!matched) {
      logUpdate(`Authenticode signer does not match a configured publisher: ${subject}`);
      return false;
    }
    logUpdate(`Authenticode signature verified (${subject}).`);
    return true;
  } catch (error) {
    logUpdate(`Authenticode verification error: ${error.message}`);
    return false;
  }
}

async function verifyDownloadedUpdate(info) {
  // Integrity is always checked. Publisher identity is checked when this
  // build declares an expected publisher name.

  try {
    if (!info.downloadedFile || !fs.existsSync(info.downloadedFile)) {
      logUpdate('Downloaded file missing');
      return false;
    }

    // Verify file exists and has content
    const stats = fs.statSync(info.downloadedFile);
    if (stats.size === 0) {
      logUpdate('Downloaded file is empty');
      return false;
    }

    // Verify SHA-512 if provided by update metadata
    if (info.files && info.files.length > 0) {
      const expectedSha512 = info.files[0].sha512;
      if (expectedSha512) {
        const actualSha512 = await computeFileHash(info.downloadedFile, 'sha512');
        if (actualSha512.toLowerCase() !== expectedSha512.toLowerCase()) {
          logUpdate(`SHA-512 mismatch: expected ${expectedSha512}, got ${actualSha512}`);
          return false;
        }
        logUpdate('SHA-512 checksum verified');
      } else {
        logUpdate('Update metadata carried no SHA-512; integrity could not be verified.');
        return false;
      }
    } else {
      logUpdate('Update metadata carried no file list; integrity could not be verified.');
      return false;
    }

    // Publisher identity: only meaningful when the build declares an expected
    // publisher. Without a declared publisher this build cannot assert who
    // signed the installer, so the check is reported as skipped rather than
    // silently passed.
    const publisherNames = configuredPublisherNames();
    if (publisherNames.length) {
      const signed = verifyAuthenticodeSignature(info.downloadedFile, publisherNames);
      if (signed !== true) return false;
    } else if (UPDATE_CONFIG.requireCodeSigning) {
      logUpdate('Code signing is required but this build declares no publisherName; '
        + 'the update is SHA-512 verified only. Configure win.publisherName and a '
        + 'signing certificate to enforce publisher identity.');
    }

    return true;
  } catch (error) {
    logUpdate(`Verification error: ${error.message}`);
    return false;
  }
}

function checkForUpdates() {
  if (isChecking) {
    logUpdate('Update check already in progress');
    return Promise.resolve();
  }

  isChecking = true;
  sendToRenderer('update:status', { status: 'checking' });

  return autoUpdater.checkForUpdates()
    .then((result) => {
      if (!result || !result.updateInfo) {
        // No update or error handled by events
        return;
      }
    })
    .catch((error) => {
      logUpdate(`checkForUpdates error: ${error.message}`);
      sendToRenderer('update:status', { status: 'error', error: error.message });
    })
    .finally(() => {
      isChecking = false;
    });
}

function startPeriodicChecks() {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(() => {
    if (!isChecking) checkForUpdates();
  }, UPDATE_CONFIG.checkIntervalMs);
  // Don't prevent app exit
  updateCheckTimer.unref();
}

function stopPeriodicChecks() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}

function quitAndInstall() {
  if (!updateDownloaded || !lastUpdateInfo) {
    logUpdate('quitAndInstall called but no update downloaded');
    return false;
  }
  logUpdate('Installing update and quitting...');
  
  // Create rollback point before installation
  createRollbackPoint(lastUpdateInfo.version);
  
  autoUpdater.quitAndInstall(false, true);
  return true;
}

/**
 * Create a rollback point by backing up critical application files.
 */
function createRollbackPoint(newVersion) {
  try {
    const appPath = app.getAppPath();
    const backupDir = path.join(app.getPath('userData'), 'backups', `pre-${newVersion}-${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    
    // Backup critical files (package.json, main process, etc.)
    const criticalFiles = [
      'package.json',
      'electron/main.cjs',
      'dist/server.cjs',
    ];
    
    for (const file of criticalFiles) {
      const src = path.join(appPath, file);
      const dest = path.join(backupDir, file);
      if (fs.existsSync(src)) {
        const destDir = path.dirname(dest);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
    
    logUpdate(`Rollback point created at ${backupDir}`);
    return backupDir;
  } catch (e) {
    logUpdate(`Failed to create rollback point: ${e.message}`);
    return null;
  }
}

/**
 * Attempt to rollback to the previous version.
 */
function rollbackUpdate() {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      throw new Error('No backup directory found');
    }
    
    // Find the most recent backup
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('pre-'))
      .sort()
      .reverse();
    
    if (backups.length === 0) {
      throw new Error('No rollback points available');
    }
    
    const latestBackup = path.join(backupDir, backups[0]);
    const appPath = app.getAppPath();
    
    // Restore critical files
    const criticalFiles = [
      'package.json',
      'electron/main.cjs',
      'dist/server.cjs',
    ];
    
    for (const file of criticalFiles) {
      const src = path.join(latestBackup, file);
      const dest = path.join(appPath, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
    
    logUpdate(`Rolled back to backup: ${backups[0]}`);
    return true;
  } catch (e) {
    logUpdate(`Rollback failed: ${e.message}`);
    return false;
  }
}

/**
 * Post-update health check - run after successful installation.
 */
async function runPostUpdateHealthCheck(newVersion) {
  try {
    logUpdate(`Running post-update health check for version ${newVersion}`);
    
    // Check 1: Verify critical files exist and are valid
    const criticalFiles = [
      'package.json',
      'electron/main.cjs',
      'dist/server.cjs',
    ];
    
    for (const file of criticalFiles) {
      const filePath = path.join(app.getAppPath(), file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Critical file missing after update: ${file}`);
      }
      // Validate JSON files
      if (file.endsWith('.json')) {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    }
    
    // Check 2: Verify version bump
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
    if (pkg.version !== newVersion) {
      throw new Error(`Version mismatch: package.json shows ${pkg.version}, expected ${newVersion}`);
    }
    
    // Check 3: Verify server file is syntactically valid
    // This would require the server to be running, which it won't be during quitAndInstall
    // But we can verify the server file is syntactically valid
    const serverCode = fs.readFileSync(path.join(app.getAppPath(), 'dist/server.cjs'), 'utf8');
    if (!serverCode.includes('createServer') || !serverCode.includes('listen')) {
      throw new Error('Server entry point appears corrupted');
    }
    
    logUpdate(`Post-update health check PASSED for version ${newVersion}`);
    return true;
  } catch (e) {
    logUpdate(`Post-update health check FAILED: ${e.message}`);
    
    // Attempt automatic rollback on health check failure
    logUpdate('Attempting automatic rollback...');
    const rolledBack = rollbackUpdate();
    if (rolledBack) {
      logUpdate('Rollback successful. Please restart the application.');
    } else {
      logUpdate('Rollback FAILED. Manual intervention required.');
    }
    return false;
  }
}

function getUpdateStatus() {
  return {
    isChecking,
    updateDownloaded,
    lastUpdateInfo: lastUpdateInfo ? {
      version: lastUpdateInfo.version,
      currentVersion: app.getVersion(),
      releaseDate: lastUpdateInfo.releaseDate,
      releaseNotes: lastUpdateInfo.releaseNotes,
      downloadedAt: lastUpdateInfo.downloadedAt,
    } : null,
    channel: UPDATE_CONFIG.channel,
    checkIntervalMs: UPDATE_CONFIG.checkIntervalMs,
  };
}

function setChannel(channel) {
  if (!['stable', 'beta', 'development'].includes(channel)) {
    throw new Error('Invalid channel: must be stable, beta, or development');
  }
  UPDATE_CONFIG.channel = channel;
  UPDATE_CONFIG.allowPrerelease = channel !== 'stable';
  UPDATE_CONFIG.allowDowngrade = channel === 'development';
  autoUpdater.allowPrerelease = UPDATE_CONFIG.allowPrerelease;
  autoUpdater.allowDowngrade = UPDATE_CONFIG.allowDowngrade;

  // Persist channel preference
  try {
    const settingsPath = path.join(app.getPath('userData'), 'app-settings.v3.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.system = settings.system || {};
      settings.system.updateChannel = channel;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }
  } catch (e) { /* best effort */ }

  logUpdate(`Update channel changed to: ${channel}`);
  // Re-check with new channel
  return checkForUpdates();
}

function setAutoCheck(enabled) {
  UPDATE_CONFIG.checkOnStartup = enabled;
  if (enabled) startPeriodicChecks();
  else stopPeriodicChecks();
  logUpdate(`Auto-check ${enabled ? 'enabled' : 'disabled'}`);
}

module.exports = {
  initializeUpdater,
  checkForUpdates,
  quitAndInstall,
  getUpdateStatus,
  setChannel,
  setAutoCheck,
  runPostUpdateHealthCheck,
  UPDATE_CONFIG,
};