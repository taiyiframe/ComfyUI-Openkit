# ComfyUI-Openkit

Open, standardized ComfyUI utility node collection. No black-box encapsulation, every node is transparent and well-documented.

寮€鏀俱€佽鑼冪殑 ComfyUI 宸ュ叿鑺傜偣闆嗗悎銆傛棤榛戠洅灏佽锛屾瘡涓妭鐐瑰潎閫忔槑鍙帶銆佹枃妗ｅ畬澶囥€?
---

## Features / 鍔熻兘鐗规€?
- **JSON-driven prompt generation** 鈥?Extract structured data from JSON and generate MiniMax H3 six-part standard prompts
- **Multi-frame reference management** 鈥?Organize keyframes, image lists, and background layers with correct index ordering
- **Subject reference tag replacement** 鈥?Replace entity names with `<Subject N>` tags across all prompt sections
- **H3 multi-segment media loading** 鈥?Up to 64 video-segment reference bundles (pictures/videos/audios) with trim, crop, soundtracks, presets
- **Standard ComfyUI plugin structure** 鈥?Follows official conventions, easy to install and extend
- **Fully documented** 鈥?Every input, output, and internal logic is explained

- **JSON 椹卞姩鎻愮ず璇嶇敓鎴?* 鈥?浠?JSON 鎻愬彇缁撴瀯鍖栨暟鎹紝鐢熸垚 MiniMax H3 鍏寮忔爣鍑嗘彁绀鸿瘝
- **澶氬抚鍙傝€冪鐞?* 鈥?绠＄悊鍏抽敭甯с€佸浘鍍忓垪琛ㄤ笌鑳屾櫙灞傦紝绱㈠紩椤哄簭姝ｇ‘
- **涓讳綋寮曠敤鏍囩缃崲** 鈥?鍦ㄦ墍鏈夋彁绀鸿瘝娈佃惤涓皢瀹炰綋鍚嶆浛鎹负 `<Subject N>` 鏍囩
- **H3 澶氭绱犳潗鍔犺浇** 鈥?鏈€澶?64 鏉¤棰戞鍙傝€冪礌鏉愰泦锛堝浘/瑙嗛/闊抽锛夛紝鏀寔瑁佸壀銆佽鍒囥€侀煶杞ㄣ€侀璁?- **鏍囧噯 ComfyUI 鎻掍欢缁撴瀯** 鈥?閬靛惊瀹樻柟瑙勮寖锛屾槗浜庡畨瑁呬笌鎵╁睍
- **瀹屾暣鏂囨。** 鈥?姣忎釜杈撳叆銆佽緭鍑哄強鍐呴儴閫昏緫鍧囨湁璇存槑

---

## Nodes / 鑺傜偣鍒楄〃

### 1. JsonExtractor (JSON鎻愬彇)

Extracts structured fields from JSON input and generates a complete MiniMax H3 six-part standard prompt. Supports character/prop/scene/keyframe archives, automatic subject definition generation, and intelligent entity-to-tag mapping.

浠?JSON 杈撳叆涓彁鍙栫粨鏋勫寲瀛楁锛岀敓鎴愬畬鏁寸殑 MiniMax H3 鍏寮忔爣鍑嗘彁绀鸿瘝銆傛敮鎸佽鑹?閬撳叿/鍦烘櫙/鍏抽敭甯ф。妗堛€佷富浣撳畾涔夎嚜鍔ㄧ敓鎴愩€佹櫤鑳藉疄浣撳埌鏍囩鐨勬槧灏勩€?
**Inputs / 杈撳叆:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| `json` | STRING (required) | JSON string or object / JSON 瀛楃涓叉垨瀵硅薄 |
| `绱㈠紩` | INT | Shot sequence index (default: 1) / 鍒嗛暅搴忓垪缂栧彿锛堥粯璁?1锛?|
| `妗ｆ閫夋嫨` | COMBO | Select archive type: 瑙掕壊妗ｆ / 闊宠壊妗ｆ / 閬撳叿妗ｆ / 鍦烘櫙妗ｆ / 鍏抽敭甯ф。妗?|
| `瑙掕壊杈撳嚭` | BOOLEAN | Toggle character archive output / 瑙掕壊妗ｆ杈撳嚭寮€鍏?|
| `閬撳叿杈撳嚭` | BOOLEAN | Toggle prop archive output / 閬撳叿妗ｆ杈撳嚭寮€鍏?|
| `鍦烘櫙杈撳嚭` | BOOLEAN | Toggle scene archive output / 鍦烘櫙妗ｆ杈撳嚭寮€鍏?|
| `鍏抽敭甯ц緭鍑篳 | BOOLEAN | Toggle keyframe archive output / 鍏抽敭甯ф。妗堣緭鍑哄紑鍏?|
| `BGM杈撳嚭` | BOOLEAN | Toggle BGM output (off 鈫?outputs N/A) / BGM 杈撳嚭寮€鍏筹紙鍏冲垯杈撳嚭 N/A锛?|
| `鎯呰妭杈撳嚭` | BOOLEAN | Toggle pure plot text output / 绾儏鑺傛枃鏈緭鍑哄紑鍏?|
| `鑷畾涔夋钀斤紙鏈熬杩藉姞锛塦 | STRING | Custom text appended at the end (e.g., Negative prompt) / 鏈熬杩藉姞鐨勮嚜瀹氫箟鏂囨湰锛堝 Negative 鎻愮ず璇嶏級 |

**Outputs / 杈撳嚭:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| `鏁翠綋椋庢牸` | STRING | Overall style description / 鏁翠綋椋庢牸鎻忚堪 |
| `妗ｆ` | STRING | Selected archive content / 閫変腑鐨勬。妗堝唴瀹?|
| `妗ｆ缂栫爜` | INT | Selected archive index / 閫変腑鐨勬。妗堢储寮曠紪鍙?|
| `鍒嗛暅搴忓垪` | STRING | Complete H3 six-part prompt / 瀹屾暣鐨?H3 鍏寮忔彁绀鸿瘝 |
| `瑙掕壊閬撳叿鍦烘櫙` | STRING | Combined character/prop/scene text / 瑙掕壊閬撳叿鍦烘櫙鍚堝苟鏂囨湰 |
| `鍏抽敭甯х储寮昤 | STRING | Keyframe picture index tags / 鍏抽敭甯у浘鐗囩储寮曟爣绛?|
| `瑙掕壊绱㈠紩` | STRING | Character picture index tags / 瑙掕壊鍥剧墖绱㈠紩鏍囩 |
| `閬撳叿绱㈠紩` | STRING | Prop picture index tags / 閬撳叿鍥剧墖绱㈠紩鏍囩 |
| `鍦烘櫙绱㈠紩` | STRING | Scene picture index tags / 鍦烘櫙鍥剧墖绱㈠紩鏍囩 |
| `绱㈠紩鏃堕暱` | FLOAT | Shot duration in seconds / 鍒嗛暅鏃堕暱锛堢锛?|
| `鍦烘櫙鍒ゆ柇` | BOOLEAN | Whether current shot is a scene / 褰撳墠鍒嗛暅鏄惁涓哄満鏅?|

**Generated H3 Prompt Structure / 鐢熸垚鐨?H3 鎻愮ず璇嶇粨鏋?**

```
subject_definitions:    # Auto-generated from archives referenced in summary & camera moves
summary:                # Extracted from JSON 鎽樿 field
retention_analysis:     # Auto-generated for each subject with fully_preserved
detailed_description:   # Auto-generated overview + camera move segments (鈫?prefix)
overall_soundscape:     # Extracted from JSON 鐜闊?field
non_diegetic_music:     # Extracted from JSON BGM field (N/A when disabled)
[custom paragraph]      # Appended if provided (e.g., Negative: ...)
```

---

### 2. MultiframeRef (澶氬抚鍙傝€?

Manages multi-frame reference images with fixed layout: keyframe first, then dynamic image list (1鈥?), background last. Background is always pinned to the bottom layer. Supports single-frame mode that hides the keyframe input.

绠＄悊澶氬抚鍙傝€冨浘鐗囷紝鍥哄畾甯冨眬锛氬叧閿抚棣栦綅锛屽姩鎬佸浘鍍忓垪琛紙1鈥?锛夊眳涓紝鑳屾櫙鏈綅銆傝儗鏅缁堝浐瀹氬湪鏈€搴曞眰銆傛敮鎸佸崟甯фā寮忥紙闅愯棌鍏抽敭甯ц緭鍏ワ級銆?
**Inputs / 杈撳叆:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| `鍏抽敭甯 | IMAGE | Keyframe reference image (Picture 1) / 鍏抽敭甯у弬鑰冨浘锛圥icture 1锛?|
| `鍥惧儚鍒楄〃1` | IMAGE | Reference image 1 (auto-expands to 鍥惧儚鍒楄〃2 when connected) / 鍙傝€冨浘1锛堣繛鎺ュ悗鑷姩灞曞紑鍥惧儚鍒楄〃2锛?|
| `鍥惧儚鍒楄〃2`鈥揱鍥惧儚鍒楄〃7` | IMAGE | Dynamically expanded reference images / 鍔ㄦ€佹墿灞曠殑鍙傝€冨浘 |
| `鑳屾櫙` | IMAGE | Background image (always last layer, not counted in 9-image limit) / 鑳屾櫙鍥撅紙濮嬬粓涓烘渶鍚庝竴灞傦紝涓嶈鍏?寮犱笂闄愶級 |
| `鍗曞抚妯″紡` | BOOLEAN | When enabled, hides keyframe input / 鍚敤鏃堕殣钘忓叧閿抚杈撳叆 |

**Outputs / 杈撳嚭:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| `鍥惧儚` | IMAGE | Concatenated image batch in correct order / 鎸夋纭『搴忔嫾鎺ョ殑鍥惧儚鎵规 |
| `鏁伴噺` | INT | Total image count (excluding background) / 鍥剧墖鎬绘暟锛堜笉鍚儗鏅級 |

**Index Ordering / 绱㈠紩椤哄簭:**

1. Keyframe 鈫?`<Picture 1>`
2. Image list 1鈥? 鈫?`<Picture 2>` 鈥?`<Picture 8>`
3. Background 鈫?always last layer (not counted in the 9-image H3 limit)

---

### 3. SubjectRefTagReplacement (涓讳綋寮曠敤鏍囩缃崲)

Replaces entity names (characters, props, scenes, keyframes) with corresponding `<Subject N>` reference tags across all prompt sections **except** `subject_definitions` itself. This keeps definitions readable while ensuring consistent tag usage in summary, retention_analysis, detailed_description, and soundscape sections.

鍦ㄩ櫎 `subject_definitions` 浠ュ鐨勬墍鏈夋彁绀鸿瘝娈佃惤涓紝灏嗗疄浣撳悕锛堣鑹层€侀亾鍏枫€佸満鏅€佸叧閿抚锛夋浛鎹负瀵瑰簲鐨?`<Subject N>` 寮曠敤鏍囩銆備繚鎸佸畾涔夋鍙锛屽悓鏃剁‘淇濇憳瑕併€佷竴鑷存€у垎鏋愩€佽缁嗘弿杩板拰鐜澹板満娈佃惤涓爣绛句娇鐢ㄤ竴鑷淬€?
**Inputs / 杈撳叆:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| `鎻愮ず璇峘 | STRING (required) | Full H3 six-part prompt text / 瀹屾暣鐨?H3 鍏寮忔彁绀鸿瘝鏂囨湰 |
| `涓讳綋鍒楄〃` | STRING | Newline-separated entity names to replace / 鎹㈣鍒嗛殧鐨勫緟鏇挎崲瀹炰綋鍚嶅垪琛?|

**Outputs / 杈撳嚭:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| `鎻愮ず璇峘 | STRING | Prompt with entity names replaced by `<Subject N>` tags / 瀹炰綋鍚嶅凡鏇挎崲涓?`<Subject N>` 鏍囩鐨勬彁绀鸿瘝 |

**Behavior / 琛屼负:**

- `subject_definitions` section is **never** modified (definitions keep original names)
- All other sections (`summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`) have entity names replaced
- Tags are assigned in the order entities appear in `subject_definitions`
- 涓嶄慨鏀?`subject_definitions` 娈佃惤锛堝畾涔変繚鐣欏師濮嬪悕绉帮級
- 鍏朵粬鎵€鏈夋钀斤紙`summary`銆乣retention_analysis`銆乣detailed_description`銆乣overall_soundscape`銆乣non_diegetic_music`锛変腑鐨勫疄浣撳悕琚浛鎹?- 鏍囩鎸夊疄浣撳湪 `subject_definitions` 涓嚭鐜扮殑椤哄簭鍒嗛厤

---

### 4. MediaLoader (H3 澶氭绱犳潗鍔犺浇)

Loads the full reference-media set for multiple MiniMax H3 video segments on a single node. Each added track (up to 64) is one segment's complete, **independent** reference bundle: pictures (up to 16), videos (鈮?) and audios (鈮?). There is **no combined total budget** 鈥?the H3 per-video limits are handled by a later node, so the panel lets you load as many pictures as you need. Per-track video trim, picture/video crop, soundtrack pairing, drag sorting, enable/disable, presets and H3 tag display are all built in. Pictures carry a category (鍏抽敭甯?/ 瑙掕壊 / 閬撳叿 / 鍦烘櫙) and a number, and are kept sorted as 鍏抽敭甯?鈫?瑙掕壊 鈫?閬撳叿 鈫?鍦烘櫙.

鍗曡妭鐐瑰姞杞藉涓?MiniMax H3 瑙嗛娈电殑瀹屾暣鍙傝€冪礌鏉愩€傛瘡鏉℃坊鍔犵殑婊戣建锛堟渶澶?64 鏉★級= 涓€涓棰戞瀹屾暣涓?*鐙珛**鐨勫弬鑰冪礌鏉愰泦锛氬弬鑰冨浘锛堟渶澶?32锛夈€佸弬鑰冭棰戯紙鈮?锛夈€佸弬鑰冮煶棰戯紙鈮?锛夈€?*鏃犳€荤礌鏉愰绠楅檺鍒?*鈥斺€擧3 鍗曟涓婇檺鐢卞悗缁妭鐐瑰鐞嗭紝闈㈡澘鍙寜闇€鍔犺浇浠绘剰鏁伴噺鐨勫弬鑰冨浘銆傚唴缃瘡娈佃棰戣鍓€佸浘鐗?瑙嗛瑁佸垏銆侀煶杞ㄩ厤瀵广€佹嫋鎷芥帓搴忋€佸紑鍏炽€侀璁句笌 H3 鏍囩鏄剧ず銆傛瘡寮犲弬鑰冨浘甯﹀垎绫伙紙鍏抽敭甯?/ 瑙掕壊 / 閬撳叿 / 鍦烘櫙锛変笌缂栧彿锛屾寜 鍏抽敭甯?鈫?瑙掕壊 鈫?閬撳叿 鈫?鍦烘櫙 椤哄簭鎺掑垪銆?
**Inputs / 杈撳叆:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| media_state | STRING (hidden) | Multi-track JSON {"tracks":[{name,items}]}, maintained by the panel / 澶氳建绱犳潗 JSON锛岀敱闈㈡澘鑷姩缁存姢锛堥殣钘忥級 |
| track_index (婊戣建绱㈠紩) | INT | Which track track_references outputs (1-based, clamped) / 鎸囧畾 track_references 杈撳嚭鍝竴杞紙1 璧凤紝瓒婄晫鑷姩鏀舵暃锛?|

**Outputs / 杈撳嚭:**

| Port / 绔彛 | Type / 绫诲瀷 | Description / 璇存槑 |
|---|---|---|
| 
eferences (鍏ㄩ儴绱犳潗) | H3_REFS | All tracks merged into a single bundle, order preserved / 鍏ㄩ儴婊戣建鍚堝苟鐨勭礌鏉?bundle锛屼繚鎸侀『搴?|
| track_references (鎸囧畾绱犳潗) | H3_REFS | The bundle of the track selected by track_index / 鎸夋粦杞ㄧ储寮曡矾鐢辩殑鍗曡建绱犳潗 bundle |
| track_count (娈垫暟) | INT | Number of tracks currently configured / 褰撳墠宸查厤缃殑婊戣建鏁?|

**Capabilities / 鑳藉姏:**

- Up to 64 tracks, each holding one segment's pictures / videos / audios, **independent limits** / 鏈€澶?64 鏉℃粦杞紝姣忚建鐙珛瀛樻斁鍥?瑙嗛/闊抽锛?*涓婇檺浜掔浉鐙珛**
- Per-track capacity: up to 16 pictures, 3 videos, 8 audio clips; no combined total limit / 姣忚建瀹归噺锛氭渶澶?32 鍥俱€? 瑙嗛銆? 闊抽锛涙棤鎬荤礌鏉愭暟涓婇檺
- Track add / delete / collapse / rename; add a track with one click / 婊戣建娣诲姞/鍒犻櫎/鎶樺彔/閲嶅懡鍚嶏紝涓€閿柊澧炴暣濂楃礌鏉愬姞杞藉櫒
- Video trim (start/end seconds) with preview / 瑙嗛瑁佸壀锛堣捣姝㈢锛夊甫棰勮
- Picture & video crop (normalised rect, draggable) / 鍥剧墖涓庤棰戣鍒囷紙褰掍竴鍖栫煩褰紝鍙嫋鎷斤級
- Every picture carries a **category** (鍏抽敭甯?/ 瑙掕壊 / 閬撳叿 / 鍦烘櫙) and a number; the panel sorts pictures as 鍏抽敭甯?1,2,3鈥?鈫?瑙掕壊 1,2,3鈥?鈫?閬撳叿 1,2,3鈥?鈫?鍦烘櫙 1,2,3鈥?and re-sorts after any edit / 姣忓紶鍙傝€冨浘甯?*鍒嗙被**锛堝叧閿抚 / 瑙掕壊 / 閬撳叿 / 鍦烘櫙锛変笌缂栧彿锛涢潰鏉挎寜 鍏抽敭甯?1,2,3鈥?鈫?瑙掕壊 1,2,3鈥?鈫?閬撳叿 1,2,3鈥?鈫?鍦烘櫙 1,2,3鈥?鎺掑簭锛屼慨鏀瑰悗鑷姩閲嶆帓
- Soundtrack routing per video: paired / standalone / off / 姣忎釜瑙嗛鐨勯煶杞ㄨ矾鐢憋細閰嶅 / 鐙珛 / 鍏抽棴
- Drag sorting, enable/disable, delete, budget monitor / 鎷栨嫿鎺掑簭銆佸紑鍏炽€佸垹闄ゃ€侀绠楃洃鎺?- H3 tag display per item (<Picture N> / <Video N> / <Audio N>) / 姣忛」鏄剧ず H3 鏍囩
- Presets: save / load / delete per track / 棰勮锛氭瘡杞ㄧ嫭绔嬩繚瀛?鍔犺浇/鍒犻櫎
- The splitter node (ReferenceSplitter) emits **4 category picture lists** (keyframes / characters / props / scenes), each ordered by the user-set number, instead of fixed picture_1..9 slots / 鎷嗗垎鑺傜偣锛圡iniMaxH3ReferenceSplitter锛夎緭鍑?**4 涓垎绫诲浘鐗囧垪琛?*锛堝叧閿抚 / 瑙掕壊 / 閬撳叿 / 鍦烘櫙锛夛紝姣忕被鎸夌敤鎴风紪鍙锋帓搴忥紝鍙栦唬鍘熷厛鍥哄畾鐨?picture_1..9
- Output is flexible: track_references routes one segment via track_index; 
eferences gives every track merged / 杈撳嚭鐏垫椿锛氥€屾寚瀹氱礌鏉愩€嶆寜婊戣建绱㈠紩璺敱鍗曟锛屻€屽叏閮ㄧ礌鏉愩€嶅悎骞舵墍鏈夎建

**Indexing / 鏍囩缂栧彿:**

- Tags are numbered **per track**, restarting at 1 for each track / 鏍囩鎸?*娈靛唴**缂栧彿锛屾瘡娈典粠 1 閲嶆柊寮€濮?- Pictures 鈫?<Picture 1..16>, ordered 鍏抽敭甯?鈫?瑙掕壊 鈫?閬撳叿 鈫?鍦烘櫙, each group by number / 鍙傝€冨浘 鈫?<Picture 1..16>锛屾寜 鍏抽敭甯?鈫?瑙掕壊 鈫?閬撳叿 鈫?鍦烘櫙銆佺粍鍐呮寜缂栧彿鎺掑簭
- Videos 鈫?<Video 1..3> 路 Audios (incl. split soundtracks) 鈫?<Audio 1..8>
- 鍙傝€冭棰?鈫?<Video 1..3> 路 闊抽锛堝惈鍒嗙闊宠建锛夆啋 <Audio 1..8>

**Quick start / 蹇€熶笂鎵?**

1. Add the node, click 娣诲姞婊戣建 to create tracks (up to 64) / 娣诲姞鑺傜偣锛岀偣銆屾坊鍔犳粦杞ㄣ€嶅缓杞紙鏈€澶?64 鏉★級
2. In each track use the same loader as the original node to upload files / 姣忔潯婊戣建鐢ㄤ笌鍘熻妭鐐逛竴鑷寸殑鏂瑰紡涓婁紶绱犳潗
3. Use 瑁佸壀 / 瑁佸垏 to trim or crop, click the audio-mode chip to pair/split/off a soundtrack / 鐢ㄣ€岃鍓?瑁佸垏銆嶅鐞嗙礌鏉愶紝鐐归煶杞ㄨ姱鐗囧垏鎹㈤厤瀵?鐙珛/鍏抽棴
4. Set track_index for track_references (single segment) or read 
eferences (all tracks merged) / 璁俱€屾粦杞ㄧ储寮曘€嶅彇銆屾寚瀹氱礌鏉愩€嶏紙鍗曟锛夛紝鎴栬銆屽叏閮ㄧ礌鏉愩€嶏紙鍚堝苟鍏ㄩ儴杞級
\n---\n\n## Installation / 瀹夎鏂规硶

### Method 1: Git Clone / 鏂规硶涓€锛欸it 鍏嬮殕

```bash
cd ComfyUI/custom_nodes/
git clone https://gitee.com/dbmcp/ComfyUI-Openkit.git
# or mirror: https://github.com/dbmcp/ComfyUI-Openkit.git
```

### Method 2: Manual / 鏂规硶浜岋細鎵嬪姩瀹夎

1. Download the repository as ZIP
2. Extract to `ComfyUI/custom_nodes/ComfyUI-Openkit/`
3. Restart ComfyUI

1. 涓嬭浇浠撳簱 ZIP 鍖?2. 瑙ｅ帇鍒?`ComfyUI/custom_nodes/ComfyUI-Openkit/`
3. 閲嶅惎 ComfyUI

---

## Usage / 浣跨敤璇存槑

### Basic Workflow / 鍩烘湰宸ヤ綔娴?
1. **JsonExtractor** 鈥?Feed your JSON script, select archive type, get structured outputs and the complete H3 prompt
2. **MultiframeRef** 鈥?Connect your keyframe, image list, and background images in order
3. **SubjectRefTagReplacement** 鈥?Pass the generated prompt through this node to standardize subject tags
4. **MediaLoader** 鈥?Load per-segment reference media, connect `鍏ㄩ儴绱犳潗` or route `鎸囧畾绱犳潗` via `瑙嗛绱㈠紩`
5. Connect outputs to your video generation node (e.g., MiniMax H3)

1. **JsonExtractor** 鈥?杈撳叆 JSON 鍓ф湰锛岄€夋嫨妗ｆ绫诲瀷锛岃幏寰楃粨鏋勫寲杈撳嚭鍜屽畬鏁寸殑 H3 鎻愮ず璇?2. **MultiframeRef** 鈥?鎸夐『搴忚繛鎺ュ叧閿抚銆佸浘鍍忓垪琛ㄥ拰鑳屾櫙鍥?3. **SubjectRefTagReplacement** 鈥?灏嗙敓鎴愮殑鎻愮ず璇嶉€氳繃姝よ妭鐐规爣鍑嗗寲涓讳綋鏍囩
4. **MediaLoader** 鈥?鍔犺浇鍚勬鍙傝€冪礌鏉愶紝杩炪€屽叏閮ㄧ礌鏉愩€嶆垨鎸夈€岃棰戠储寮曘€嶅彇銆屾寚瀹氱礌鏉愩€?5. 灏嗚緭鍑鸿繛鎺ュ埌瑙嗛鐢熸垚鑺傜偣锛堝 MiniMax H3锛?
### JSON Input Format / JSON 杈撳叆鏍煎紡绀轰緥

```json
{
  "鏁翠綋椋庢牸": "Overall style description...",
  "瑙掕壊妗ｆ": ["Character 1 description...", "Character 2 description..."],
  "闊宠壊妗ｆ": ["Voice 1 description..."],
  "閬撳叿妗ｆ": ["Prop 1 description..."],
  "鍦烘櫙妗ｆ": ["Scene 1 description..."],
  "鍏抽敭甯ф。妗?: ["Keyframe 1 description..."],
  "鍒嗛暅搴忓垪": [
    {
      "缂栧彿": 1,
      "绫诲瀷": "鏂囨垙锛?0绉?,
      "鏍囬": "Shot title",
      "鎽樿": "Summary text...",
      "杩愰暅": ["鈫扖amera move 1...", "鈫扖amera move 2..."],
      "鐜闊?: "Environmental sound description...",
      "BGM": "Background music or N/A"
    }
  ]
}
```

---

## Directory Structure / 鐩綍缁撴瀯

```
ComfyUI-Openkit/
鈹溾攢鈹€ __init__.py              # Plugin entry / 鎻掍欢鍏ュ彛锛屾敞鍐岃妭鐐规槧灏?鈹溾攢鈹€ nodes/
鈹?  鈹溾攢鈹€ __init__.py          # Node class & display name mappings / 鑺傜偣绫讳笌鏄剧ず鍚嶆槧灏?鈹?  鈹溾攢鈹€ json_extractor.py    # JsonExtractor implementation / JSON 鎻愬彇鑺傜偣
鈹?  鈹溾攢鈹€ multiframe_ref.py    # MultiframeRef implementation / 澶氬抚鍙傝€冭妭鐐?鈹?  鈹溾攢鈹€ subject_ref_tag_replacement.py  # SubjectRefTagReplacement / 涓讳綋鏍囩缃崲鑺傜偣
鈹?  鈹溾攢鈹€ media_loader.py      # MediaLoader implementation / H3 澶氭绱犳潗鍔犺浇鑺傜偣
鈹?  鈹溾攢鈹€ media_io.py          # Image/video/audio decoding helpers / 鍥?瑙嗛/闊抽瑙ｇ爜杈呭姪
鈹?  鈹斺攢鈹€ media_routes.py      # Upload/probe/preset HTTP routes / 涓婁紶/鎺㈡祴/棰勮鏈嶅姟璺敱
鈹溾攢鈹€ web/
鈹?  鈹斺攢鈹€ js/
鈹?      鈹溾攢鈹€ multiframe_ref.js  # Frontend dynamic input expansion / 鍓嶇鍔ㄦ€佽緭鍏ユ墿灞?鈹?      鈹斺攢鈹€ media_loader.js    # H3 loader panel (tracks, trim, crop, presets) / H3 鍔犺浇闈㈡澘
鈹溾攢鈹€ pkg/
鈹?  鈹溾攢鈹€ __init__.py          # Offline dependency bootstrap / 绂荤嚎渚濊禆寮曞
鈹?  鈹溾攢鈹€ wheels/              # Vendored backend wheels (e.g. PyAV) / 绂荤嚎鍚庣 wheel
鈹?  鈹斺攢鈹€ README.md            # Offline dependency policy / 绂荤嚎渚濊禆璇存槑
鈹溾攢鈹€ tests/
鈹?  鈹溾攢鈹€ test_media_loader.py # Loader logic tests / 鍔犺浇鑺傜偣閫昏緫娴嬭瘯
鈹?  鈹斺攢鈹€ test_package_load.py # Package registration test / 鎻掍欢鍖呮敞鍐屾祴璇?鈹溾攢鈹€ requirements.txt         # Python dependencies / Python 渚濊禆澹版槑
鈹溾攢鈹€ pyproject.toml           # Project metadata / 椤圭洰鍏冧俊鎭?鈹溾攢鈹€ .gitignore               # Git ignore rules / Git 蹇界暐瑙勫垯
鈹斺攢鈹€ README.md                # This file / 鏈鏄庢枃妗?```

---

## Extending / 鎵╁睍寮€鍙?
### Adding a New Node / 鏂板鑺傜偣姝ラ

1. Create a new `.py` file under `nodes/` with your node class
2. Implement `INPUT_TYPES`, `RETURN_TYPES`, `FUNCTION`, `CATEGORY`, and the processing method
3. Import and register in `nodes/__init__.py`:
   - Add class to `NODE_CLASS_MAPPINGS`
   - Add display name to `NODE_DISPLAY_NAME_MAPPINGS`
4. Restart ComfyUI

1. 鍦?`nodes/` 涓嬪垱寤烘柊鐨?`.py` 鏂囦欢锛岀紪鍐欒妭鐐圭被
2. 瀹炵幇 `INPUT_TYPES`銆乣RETURN_TYPES`銆乣FUNCTION`銆乣CATEGORY` 鍙婂鐞嗘柟娉?3. 鍦?`nodes/__init__.py` 涓鍏ュ苟娉ㄥ唽锛?   - 灏嗙被娣诲姞鍒?`NODE_CLASS_MAPPINGS`
   - 灏嗘樉绀哄悕娣诲姞鍒?`NODE_DISPLAY_NAME_MAPPINGS`
4. 閲嶅惎 ComfyUI

### Frontend Extensions / 鍓嶇鎵╁睍

Place JavaScript files under `web/js/`. They are automatically loaded by ComfyUI on startup. Use for dynamic input visibility, custom widgets, or UI interactions.

JavaScript 鏂囦欢鏀剧疆鍦?`web/js/` 涓嬶紝ComfyUI 鍚姩鏃惰嚜鍔ㄥ姞杞姐€傜敤浜庡姩鎬佽緭鍏ユ樉闅愩€佽嚜瀹氫箟鎺т欢鎴?UI 浜や簰銆?
---

## Offline Dependencies / 绂荤嚎渚濊禆

Optional backend wheels (e.g. PyAV) are shipped under `pkg/wheels/` and, if missing on a user machine, are installed automatically into the plugin's own `pkg/site/` on first use 鈥?offline, without touching your global Python environment. See `pkg/README.md` for details.

鍙€夊悗绔緷璧栵紙濡?PyAV锛夌殑 wheel 宸插唴缃湪 `pkg/wheels/`锛岀敤鎴锋満鍣ㄧ己澶辨椂浼氳嚜鍔ㄧ绾垮畨瑁呭埌鎻掍欢绉佹湁 `pkg/site/`锛屼笉姹℃煋鍏ㄥ眬鐜銆傝瑙?`pkg/README.md`銆?
---

## Compatibility / 鍏煎鎬?
- ComfyUI latest stable / ComfyUI 鏈€鏂扮ǔ瀹氱増
- Python 3.10+
- No external dependencies beyond ComfyUI core / 闄?ComfyUI 鏍稿績澶栨棤澶栭儴渚濊禆

---

## Acknowledgments / 特别鸣谢

<span style="color:#FFD700;">

- **https://github.com/yuan-SiO2/ComfyUI-Yuan-Tool.git**
- **https://github.com/oufeixinxinren/ComfyUI-MiniMax-ContextIR.git**

特别鸣谢上述插件的作者，Openkit 开放插件部分节点是在各位大佬优秀设计的基础之上进行再次创作，欢迎大家尽情享用。

Special thanks to the authors of the above plugins. Some nodes of the Openkit plugin are recreated based on the excellent designs of these great developers. Everyone is welcome to enjoy.

</span>

---

## License / 璁稿彲璇?
鏈」鐩噰鐢?**鏈ㄥ叞瀹芥澗璁稿彲璇佺2鐗堬紙Mulan Permissive Software License, Version 2, MulanPSL-2.0锛?*銆?
This project is licensed under the **Mulan Permissive Software License, Version 2 (MulanPSL-2.0)**.

- 鍙嚜鐢变娇鐢ㄣ€佸鍒躲€佷慨鏀广€佸悎骞躲€佸彂甯冦€佸垎鍙戙€佸啀璁稿彲鍜岄攢鍞湰杞欢
- 蹇呴』鍦ㄦ墍鏈夊壇鏈腑鍖呭惈鐗堟潈澹版槑鍜岃鍙０鏄?- 鏈蒋浠舵寜"鍘熸牱"鎻愪緵锛屼笉鎻愪緵浠讳綍鏄庣ず鎴栨殫绀虹殑淇濊瘉

See [LICENSE](LICENSE) for full text. / 瀹屾暣鏉℃瑙?[LICENSE](LICENSE) 鏂囦欢銆?
