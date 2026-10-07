# Throwaway: drives the prototype with real (trusted) mouse events over CDP.
import base64, json, os, socket, struct, sys, time, urllib.request

PORT = int(sys.argv[1]); URL = sys.argv[2]; OUT = sys.argv[3]


class WS:
    def __init__(self, url):
        hostport, path = url[len('ws://'):].split('/', 1)
        host, port = hostport.split(':')
        self.s = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
                        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        resp = b''
        while b'\r\n\r\n' not in resp:
            resp += self.s.recv(1)
        self.buf, self.id, self.events = b'', 0, []

    def send(self, obj):
        data = json.dumps(obj).encode()
        hdr = bytearray([0x81]); n = len(data)
        if n < 126: hdr.append(0x80 | n)
        elif n < 65536: hdr.append(0x80 | 126); hdr += struct.pack('>H', n)
        else: hdr.append(0x80 | 127); hdr += struct.pack('>Q', n)
        mask = os.urandom(4); hdr += mask
        self.s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(1 << 20)
            if not chunk: raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        msg = b''
        while True:
            b1, b2 = self._read(2)
            n = b2 & 0x7f
            if n == 126: n = struct.unpack('>H', self._read(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._read(8))[0]
            payload = self._read(n)
            if (b1 & 0x0f) == 9: continue
            msg += payload
            if b1 & 0x80: return json.loads(msg)

    def call(self, method, **params):
        self.id += 1; mid = self.id
        self.send({'id': mid, 'method': method, 'params': params})
        while True:
            r = self.recv()
            if r.get('id') == mid:
                if 'error' in r: raise RuntimeError(r['error'])
                return r.get('result')
            self.events.append(r)


pages = json.load(urllib.request.urlopen(f'http://localhost:{PORT}/json'))
ws = WS(next(p for p in pages if p['type'] == 'page')['webSocketDebuggerUrl'])
ws.call('Runtime.enable'); ws.call('Log.enable'); ws.call('Page.enable')
ws.call('Page.navigate', url=URL)
time.sleep(4)

def ev(expr):
    r = ws.call('Runtime.evaluate', expression=expr, returnByValue=True)
    if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
    return r['result'].get('value')

HAND_JS = """(() => [...document.querySelectorAll('.card')].map(el => { const r = el.getBoundingClientRect();
  return { id: el.querySelector('.corner b').textContent + el.querySelector('.corner i').textContent.trim(),
    x: r.left + r.width / 2, l: r.left, t: r.top, w: r.width, h: r.height, z: +el.style.zIndex,
    sel: el.classList.contains('selected'), tf: el.style.transform }; })
  .filter(c => c.z >= 100 && c.z < 1000).sort((a, b) => a.x - b.x))()"""
hand = lambda: ev(HAND_JS)
peeked = lambda: next((c['id'] for c in hand() if c['z'] == 400), None)
cursor = lambda: ev("document.getElementById('screen').style.cursor")
rect = lambda sel: ev(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return {{x: r.left + r.width/2, y: r.top + r.height/2}}; }})()")
cls = lambda sel: ev(f"document.querySelector('{sel}').className")
pt = lambda c: (c['l'] + c['w'] * 0.3, c['t'] + c['h'] * 0.35)

state = {'x': 0, 'y': 0, 'down': False}
def mouse(kind, x, y):
    state.update(x=x, y=y)
    args = dict(type=kind, x=x, y=y, button='left' if kind != 'mouseMoved' or state['down'] else 'none',
                buttons=1 if state['down'] or kind == 'mousePressed' else 0, clickCount=1, pointerType='mouse')
    if kind == 'mousePressed': state['down'] = True
    if kind == 'mouseReleased': state['down'] = False; args['buttons'] = 0
    ws.call('Input.dispatchMouseEvent', **args)
def glide(x, y, steps=12, dt=0.016):
    x0, y0 = state['x'], state['y']
    for i in range(1, steps + 1):
        mouse('mouseMoved', x0 + (x - x0) * i / steps, y0 + (y - y0) * i / steps); time.sleep(dt)

results = []
def check(name, ok, detail=''):
    results.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))

h = hand()
check('dealt 7 cards', len(h) == 7, len(h))

# Hover peek
mouse('mouseMoved', 20, 20)
glide(*pt(h[2])); time.sleep(0.6)
check('hover peeks card under cursor', peeked() == h[2]['id'], f"{peeked()} vs {h[2]['id']}")
pk = next(c for c in hand() if c['z'] == 400)
check('peeked card is scaled up', 'scale(1.2' in pk['tf'], pk['tf'])
check('cursor is grab over hand', cursor() == 'grab', cursor())
ws.call('Page.captureScreenshot', format='png')  # warm-up
open(f'{OUT}-hover.png', 'wb').write(base64.b64decode(ws.call('Page.captureScreenshot', format='png')['data']))
h = hand(); target = next(c for c in h if c['id'] == h[-2]['id'])
glide(*pt(target)); time.sleep(0.5)
check('hover follows cursor', peeked() == target['id'], f"{peeked()} vs {target['id']}")
pz = rect('#playzone'); glide(pz['x'], pz['y']); time.sleep(0.5)
check('leaving hand clears peek', peeked() is None, peeked())
check('cursor resets off hand', cursor() == '', cursor())
dk = rect('#deck'); glide(dk['x'], dk['y']); time.sleep(0.1)
check('cursor is pointer over deck', cursor() == 'pointer', cursor())

# Click to select
h = hand(); glide(*pt(h[1])); time.sleep(0.5)
h = hand(); tid = peeked()
mouse('mousePressed', state['x'], state['y']); time.sleep(0.05); mouse('mouseReleased', state['x'], state['y']); time.sleep(0.5)
sel = [c['id'] for c in hand() if c['sel']]
check('click selects card', sel == [tid], f'{sel} vs {tid}')
check('hover resumes after click', peeked() == tid, peeked())

# Scrub with button held
h = hand(); glide(*pt(h[1])); time.sleep(0.3)
mouse('mousePressed', state['x'], state['y'])
glide(h[5]['l'] + h[5]['w'] * 0.3, state['y'], steps=20); time.sleep(0.4)
check('press-and-slide scrubs', peeked() == h[5]['id'], f"{peeked()} vs {h[5]['id']}")
mouse('mouseReleased', state['x'], state['y']); time.sleep(0.4)
check('scrub release does not toggle selection', len([c for c in hand() if c['sel']]) == 1)

# Drag to play
h = hand(); glide(*pt(h[3])); time.sleep(0.4); tid = peeked()
mouse('mousePressed', state['x'], state['y'])
pz = rect('#playzone'); glide(pz['x'], pz['y'], steps=18); time.sleep(0.4)
check('drag lights up play zone', 'hot' in cls('#playzone'), cls('#playzone'))
check('cursor is grabbing while dragging', cursor() == 'grabbing', cursor())
open(f'{OUT}-drag.png', 'wb').write(base64.b64decode(ws.call('Page.captureScreenshot', format='png')['data']))
mouse('mouseReleased', state['x'], state['y']); time.sleep(0.8)
check('release over zone plays card', 'has-cards' in cls('#playzone') and len(hand()) == 6 and tid not in [c['id'] for c in hand()], len(hand()))

# Drag below play line snaps back
h = hand(); glide(*pt(h[2])); time.sleep(0.4); tid = peeked()
mouse('mousePressed', state['x'], state['y'])
glide(state['x'], state['y'] - 60, steps=10); time.sleep(0.2)
mouse('mouseReleased', state['x'], state['y']); time.sleep(0.9)
check('short drag snaps back to hand', len(hand()) == 6 and tid in [c['id'] for c in hand()])

# Reorder: leftmost card to the far right
glide(400, 300); time.sleep(0.5)
h = hand(); first = h[0]
glide(*pt(first)); time.sleep(0.4)
mouse('mousePressed', state['x'], state['y'])
glide(state['x'], state['y'] - 22, steps=6); time.sleep(0.05)
glide(h[-1]['x'] + h[-1]['w'] * 0.4, state['y'], steps=24); time.sleep(0.3)
mouse('mouseReleased', state['x'], state['y']); glide(400, 300); time.sleep(0.9)
order = [c['id'] for c in hand()]
check('drag sideways reorders', order[-1] == first['id'], f"{first['id']} -> {order}")

# Long press picks up
h = hand(); glide(*pt(h[2])); time.sleep(0.4)
mouse('mousePressed', state['x'], state['y']); time.sleep(0.6)
dragging = ev("[...document.querySelectorAll('.card')].some(el => el.style.zIndex === '1000')")
check('long press picks card up', dragging)
mouse('mouseReleased', state['x'], state['y']); glide(400, 300); time.sleep(0.8)
check('long-press release returns card', len(hand()) == 6, len(hand()))

# Click deck draws
dk = rect('#deck'); glide(dk['x'], dk['y'])
mouse('mousePressed', dk['x'], dk['y']); mouse('mouseReleased', dk['x'], dk['y']); time.sleep(1.2)
check('click deck draws', len(hand()) == 7, len(hand()))

# Click pile returns
pz = rect('#playzone'); glide(pz['x'], pz['y'])
mouse('mousePressed', pz['x'], pz['y']); mouse('mouseReleased', pz['x'], pz['y']); time.sleep(1.2)
check('click pile returns played', len(hand()) == 8, len(hand()))

errs = [e for e in ws.events if e.get('method') == 'Runtime.exceptionThrown'
        or (e.get('method') == 'Log.entryAdded' and e['params']['entry']['level'] == 'error')
        or (e.get('method') == 'Runtime.consoleAPICalled' and e['params']['type'] == 'error')]
check('no console errors', not errs, json.dumps(errs)[:400])
print(f"{sum(results)}/{len(results)} passed")
