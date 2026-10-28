#!/usr/bin/env python3
"""يجهّز نسخة من التطبيق تعمل بلا إنترنت داخل الـAPK.

ينسخ index.html ويستبدل روابط three.js وDraco وخطوط Google بملفات محلية في vendor/،
وينزّل هذه الملفات (بنسخ ثابتة) مع ملفات تراخيصها. الاستخدام:
    prepare_www.py <index.html> <مجلد الإخراج www> <مجلد التخزين المؤقت>
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys

THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/'
FONTS_CSS = ('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600'
             '&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;600;700&display=swap')
CHROME_UA = ('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) '
             'Chrome/126.0 Mobile Safari/537.36')
# نقاط البداية؛ الاستيرادات النسبية داخلها تُتبع تلقائياً
THREE_FILES = [
    'build/three.module.min.js',
    'examples/jsm/controls/OrbitControls.js',
    'examples/jsm/environments/RoomEnvironment.js',
    'examples/jsm/geometries/RoundedBoxGeometry.js',
    'examples/jsm/utils/BufferGeometryUtils.js',
    'examples/jsm/loaders/GLTFLoader.js',
    'examples/jsm/loaders/DRACOLoader.js',
    'examples/jsm/exporters/GLTFExporter.js',
    'examples/jsm/libs/meshopt_decoder.module.js',
    'examples/jsm/libs/draco/gltf/draco_decoder.js',
    'examples/jsm/libs/draco/gltf/draco_decoder.wasm',
    'examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
]
LICENSES = [
    ('three.js (MIT)', THREE + 'LICENSE'),
    ('Draco decoder (Apache-2.0)', 'https://raw.githubusercontent.com/google/draco/main/LICENSE'),
    ('meshoptimizer (MIT)', 'https://raw.githubusercontent.com/zeux/meshoptimizer/master/LICENSE.md'),
    ('IBM Plex Sans Arabic (OFL-1.1)', 'https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansarabic/OFL.txt'),
    ('IBM Plex Mono (OFL-1.1)', 'https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt'),
    ('Reem Kufi (OFL-1.1)', 'https://raw.githubusercontent.com/google/fonts/main/ofl/reemkufi/OFL.txt'),
]


def fetch(url, cache, ua=None):
    """ينزّل الرابط مرة واحدة ويحفظه في المجلد المؤقت"""
    key = hashlib.sha256((url + '|' + (ua or '')).encode()).hexdigest()[:32]
    path = os.path.join(cache, key)
    if not os.path.exists(path):
        cmd = ['curl', '-fsSL', '--retry', '4', '--max-time', '300', '-o', path + '.part', url]
        if ua:
            cmd[1:1] = ['-A', ua]
        subprocess.run(cmd, check=True)
        os.replace(path + '.part', path)
    with open(path, 'rb') as f:
        return f.read()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def vendor_three(out, cache):
    todo, seen = list(THREE_FILES), set()
    while todo:
        rel = todo.pop()
        if rel in seen:
            continue
        seen.add(rel)
        data = fetch(THREE + rel, cache)
        write(os.path.join(out, 'vendor/three', rel), data)
        if rel.endswith('.js'):
            src = data.decode('utf-8', 'replace')
            for m in re.finditer(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}/[^'"]+)['"]''', src):
                todo.append(os.path.normpath(os.path.join(os.path.dirname(rel), m.group(1))))
    return sorted(seen)


def vendor_fonts(out, cache):
    css = fetch(FONTS_CSS, cache, CHROME_UA).decode('utf-8')
    names = {}

    def local(m):
        url = m.group(1)
        if url not in names:
            names[url] = 'f%02d.woff2' % len(names)
            write(os.path.join(out, 'vendor/fonts', names[url]), fetch(url, cache))
        return 'url(%s)' % names[url]

    css = re.sub(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', local, css)
    write(os.path.join(out, 'vendor/fonts/fonts.css'), css.encode('utf-8'))
    return len(names)


def main(src, out, cache):
    os.makedirs(cache, exist_ok=True)
    if os.path.exists(out):
        shutil.rmtree(out)
    with open(src, encoding='utf-8') as f:
        html = f.read()

    def swap(old, new):
        nonlocal html
        if html.count(old) != 1:
            sys.exit('prepare_www: expected exactly one occurrence of: ' + old[:80])
        html = html.replace(old, new)

    fonts = re.search(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">.*?<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2[^"]*">', html, re.S)
    if not fonts:
        sys.exit('prepare_www: Google Fonts links not found')
    swap(fonts.group(0), '<link rel="stylesheet" href="vendor/fonts/fonts.css">')
    # قيم خريطة الاستيراد يجب أن تبدأ بـ ./ وإلا عُدّت أسماء حزم
    swap(THREE + 'build/three.module.min.js', './vendor/three/build/three.module.min.js')
    swap('"three/addons/":"' + THREE + 'examples/jsm/"', '"three/addons/":"./vendor/three/examples/jsm/"')
    swap(THREE + 'examples/jsm/libs/draco/gltf/', './vendor/three/examples/jsm/libs/draco/gltf/')
    left = re.findall(r'https://(?:cdn\.jsdelivr\.net|fonts\.g[a-z]+\.com|unpkg\.com|cdnjs\.cloudflare\.com)[^"\'\s)]*', html)
    if left:
        sys.exit('prepare_www: network URLs left: ' + ', '.join(left))
    write(os.path.join(out, 'index.html'), html.encode('utf-8'))

    catalog = os.environ.get('CATALOG')
    if catalog:
        # نسخة شخصية: ملف الكتالوج الخاص بصاحب الماكينة يُضمّن ليُستورد تلقائياً عند أول تشغيل
        shutil.copyfile(catalog, os.path.join(out, 'catalog.json'))
        print('prepare_www: bundled private catalog ' + os.path.basename(catalog))
    files = vendor_three(out, cache)
    nfonts = vendor_fonts(out, cache)
    notice = ['Third-party components bundled in this app\n']
    for title, url in LICENSES:
        notice += ['=' * 72, title, url, '=' * 72, fetch(url, cache).decode('utf-8', 'replace'), '']
    write(os.path.join(out, 'vendor/LICENSES.txt'), '\n'.join(notice).encode('utf-8'))
    print('prepare_www: %d three.js files, %d font files' % (len(files), nfonts))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
