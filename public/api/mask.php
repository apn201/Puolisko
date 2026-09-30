<?php
// GET ?u=<mask url> -> mask image bytes. Only YouCam's own S3 hosts are allowed.
require __DIR__ . '/_lib.php';

pk_check_access();
$u = (string)($_GET['u'] ?? '');
$p = parse_url($u);
$host = $p['host'] ?? '';
if (($p['scheme'] ?? '') !== 'https' || !preg_match('~^yce[a-z0-9.\-]*\.amazonaws\.com$~', $host)) {
    pk_fail(400, 'not a YouCam mask url');
}
[$code, $bytes, $type] = pk_http('GET', $u);
if ($code !== 200) pk_fail(502, "mask fetch $code");
header('Content-Type: ' . ($type ?: 'image/png'));
header('Cache-Control: private, no-store');
echo $bytes;
