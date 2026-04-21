require('dotenv').config();
var { google } = require('googleapis');
var ffmpeg = require('fluent-ffmpeg');
var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var { exec } = require('child_process');

var PEXELS_API_KEY = process.env.PEXELS_API_KEY;
var YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
var YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
var YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

function downloadFile(url, dest) {
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(dest);
    var protocol = url.startsWith('https') ? https : http;
    protocol.get(url, function(response) {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(dest); } catch(e) {}
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', function() { file.close(resolve); });
    }).on('error', function(err) {
      try { fs.unlinkSync(dest); } catch(e) {}
      reject(err);
    });
  });
}

function runCommand(command) {
  return new Promise(function(resolve, reject) {
    exec(command, { maxBuffer: 1024 * 1024 * 100 }, function(error, stdout, stderr) {
      if (error) reject(new Error(error.message + '\n' + stderr));
      else resolve(stdout);
    });
  });
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ─── SORGU SİSTEMİ ───────────────────────────────────────
function getPexelsQueries() {
  // Kedi, köpek ve bebek hayvan sorguları — viral formatlar
  var catQueries = [
    'funny cat reaction close up',
    'kitten playing cute',
    'cat knocked over surprised',
    'cat mirror reaction funny',
    'kitten tiny cute sleeping',
    'cat zoomies running',
    'cat loaf sitting funny',
    'kitten bottle feeding cute',
    'cat chattering window',
    'cat box sitting funny',
    'kitten first steps cute',
    'cat scared jump funny',
    'cat stretching yawning cute',
    'kitten meowing cute',
    'cat spinning playing',
  ];

  var dogQueries = [
    'puppy cute tiny sleeping',
    'dog head tilt confused',
    'puppy first walk cute',
    'dog zoomies grass running',
    'golden retriever puppy cute',
    'puppy howling funny',
    'dog begging food funny',
    'puppy bath time cute',
    'dog tail wagging happy',
    'puppy playing ball cute',
    'dog shaking head funny',
    'corgi running funny',
    'puppy yawning sleepy cute',
    'labrador puppy playing',
    'dog fail funny reaction',
  ];

  var babyAnimalQueries = [
    'baby duck walking cute',
    'baby goat jumping playing',
    'baby bunny eating cute',
    'baby hamster tiny cute',
    'baby panda playing cute',
    'baby otter swimming cute',
    'baby deer walking cute',
    'baby elephant playing cute',
    'baby fox playing cute',
    'baby hedgehog cute tiny',
  ];

  var now = new Date();
  var seed = now.getDate() * 1000 + now.getUTCHours() * 13 + Math.floor(now.getUTCMinutes() / 20);

  // Her çalışmada farklı mix — 2 kedi + 2 köpek + 1 bebek
  var selected = [
    catQueries[seed % catQueries.length],
    catQueries[(seed + 5) % catQueries.length],
    dogQueries[seed % dogQueries.length],
    dogQueries[(seed + 7) % dogQueries.length],
    babyAnimalQueries[seed % babyAnimalQueries.length],
    catQueries[(seed + 10) % catQueries.length],
    dogQueries[(seed + 3) % dogQueries.length],
    babyAnimalQueries[(seed + 3) % babyAnimalQueries.length],
  ];

  console.log('Sorgular:', selected.slice(0, 4).join(', ') + '...');
  return selected;
}

// ─── VİDEO İNDİR ─────────────────────────────────────────
async function downloadAnimalVideos() {
  console.log('Hayvan videolari indiriliyor...');
  var queries = getPexelsQueries();
  var paths = [];
  var usedIds = [];

  for (var i = 0; i < queries.length; i++) {
    if (paths.length >= 5) break;

    try {
      var response = await fetch(
        'https://api.pexels.com/videos/search?query=' +
        encodeURIComponent(queries[i]) + '&per_page=15&orientation=portrait',
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      var data = await response.json();
      var videos = data.videos || [];

      if (videos.length === 0) {
        response = await fetch(
          'https://api.pexels.com/videos/search?query=' +
          encodeURIComponent(queries[i]) + '&per_page=15',
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        data = await response.json();
        videos = data.videos || [];
      }

      if (videos.length === 0) continue;

      // Daha önce kullanılmamış video seç
      var video = null;
      for (var j = 0; j < videos.length; j++) {
        if (usedIds.indexOf(videos[j].id) === -1) {
          video = videos[j];
          break;
        }
      }
      if (!video) continue;

      usedIds.push(video.id);
      var vf = video.video_files
        .filter(function(f) { return f.width && f.height; })
        .sort(function(a, b) { return b.height - a.height; })[0];

      if (!vf) continue;

      var vPath = '/tmp/animal_' + paths.length + '.mp4';
      console.log('  İndiriliyor:', queries[i], '| ID:', video.id);
      await downloadFile(vf.link, vPath);
      paths.push(vPath);
      await sleep(400);

    } catch(e) {
      console.log('  Hata:', queries[i], e.message);
    }
  }

  console.log(paths.length, 'video indirildi');
  if (paths.length < 2) throw new Error('Yeterli video yok: ' + paths.length);
  return paths;
}

// ─── MÜZİK ───────────────────────────────────────────────
function selectMusic() {
  var musicDir = path.join(__dirname, '..', 'music');
  var files = fs.readdirSync(musicDir).filter(function(f) { return f.endsWith('.mp3'); });
  if (files.length === 0) throw new Error('Muzik yok!');
  var now = new Date();
  var index = (now.getDate() * 7 + now.getUTCHours()) % files.length;
  console.log('Muzik:', files[index]);
  return path.join(musicDir, files[index]);
}

// ─── THUMBNAIL ────────────────────────────────────────────
async function createThumbnail(videoPath) {
  console.log('Thumbnail olusturuluyor...');

  await new Promise(function(resolve, reject) {
    ffmpeg(videoPath)
      .outputOptions([
        '-vframes 1',
        '-ss 00:00:02',
        '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      ])
      .output('/tmp/thumb_raw.jpg')
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  var now = new Date();
  var texts = [
    { top: 'WAIT FOR IT', bottom: '😂 So Funny!' },
    { top: 'I CANT STOP', bottom: '😹 Laughing!' },
    { top: 'THIS IS TOO', bottom: '😂 Cute!' },
    { top: 'NO WAY THIS', bottom: '😹 Happened!' },
    { top: 'WATCH TILL', bottom: '😂 The End!' },
    { top: 'YOU WONT', bottom: '😹 Believe This!' },
    { top: 'POV: BEST', bottom: '🐾 Pet Ever!' },
    { top: 'CAUGHT ON', bottom: '😂 Camera!' },
    { top: 'ZERO CHILL', bottom: '😹 Animals!' },
    { top: 'THIS MADE', bottom: '😂 My Day!' },
    { top: 'WHEN CATS', bottom: '😹 Go Crazy!' },
    { top: 'DOGS BEING', bottom: '😂 Goofballs!' },
    { top: 'BABY ANIMALS', bottom: '🥰 So Cute!' },
    { top: 'TINY KITTEN', bottom: '😍 Alert!' },
    { top: 'PUPPY DOES', bottom: '😂 The Thing!' },
  ];

  var t = texts[(now.getDate() * 3 + now.getUTCHours()) % texts.length];

  await runCommand(
    'ffmpeg -y -i /tmp/thumb_raw.jpg ' +
    '-vf "' +
    'drawbox=x=0:y=0:w=1080:h=320:color=black@0.75:t=fill,' +
    'drawbox=x=0:y=1600:w=1080:h=320:color=black@0.75:t=fill,' +
    'drawtext=text=\'' + t.top + '\':fontsize=110:fontcolor=white:x=(w-text_w)/2:y=90:shadowcolor=black:shadowx=6:shadowy=6,' +
    'drawtext=text=\'' + t.bottom + '\':fontsize=95:fontcolor=yellow:x=(w-text_w)/2:y=1630:shadowcolor=black:shadowx=5:shadowy=5" ' +
    '/tmp/thumbnail.jpg'
  );

  console.log('Thumbnail hazir');
  return '/tmp/thumbnail.jpg';
}

// ─── VİDEO MONTAJI ───────────────────────────────────────
async function createFinalVideo(videoPaths, musicPath) {
  console.log('Video montaji yapiliyor...');

  var TARGET = 58;
  var count = Math.min(videoPaths.length, 5);
  var clipDur = (TARGET / count).toFixed(2);
  var trimmed = [];

  for (var i = 0; i < count; i++) {
    var tp = '/tmp/trimmed_' + i + '.mp4';
    await new Promise(function(resolve, reject) {
      ffmpeg(videoPaths[i])
        .outputOptions([
          '-t ' + clipDur,
          '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
          '-r 30',
          '-c:v libx264',
          '-preset fast',
          '-crf 20',
          '-an',
        ])
        .output(tp)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    trimmed.push(tp);
    console.log('  Klip', i + 1, '/', count, 'hazir');
  }

  var listPath = '/tmp/clips_list.txt';
  fs.writeFileSync(listPath, trimmed.map(function(p) { return "file '" + p + "'"; }).join('\n'));

  var mergedPath = '/tmp/merged.mp4';
  await new Promise(function(resolve, reject) {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(mergedPath)
      .on('end', resolve).on('error', reject).run();
  });

  var finalPath = '/tmp/final_animal.mp4';
  await new Promise(function(resolve, reject) {
    ffmpeg()
      .input(mergedPath)
      .input(musicPath)
      .inputOptions(['-stream_loop -1'])
      .outputOptions([
        '-map 0:v:0',
        '-map 1:a:0',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
        '-shortest',
        '-movflags +faststart',
        '-af afade=t=out:st=' + (TARGET - 3) + ':d=3',
      ])
      .output(finalPath)
      .on('end', resolve).on('error', reject).run();
  });

  var stats = fs.statSync(finalPath);
  console.log('Final video:', (stats.size / 1024 / 1024).toFixed(1), 'MB');
  return finalPath;
}

// ─── METADATA ─────────────────────────────────────────────
function getMetadata() {
  var now = new Date();
  var day = now.getDay();
  var hour = (now.getUTCHours() + 3) % 24;

  var titles = [
    'This kitten has zero chill 😹 #cats #cute #shorts',
    'Dog does the thing again 😂 #dogs #funny #shorts',
    'Baby animal overload 🥰 #babyanimals #cute #shorts',
    'When your cat is a whole comedian 😹 #cats #shorts',
    'Puppy discovers the world 😂 #puppy #cute #shorts',
    'Animals being absolute goofballs 😹 #funny #shorts',
    'This baby animal is too precious 🥰 #cute #shorts',
    'Nobody told the cat it was on camera 😂 #cats #shorts',
    'Tiny puppy big personality 😹 #dogs #puppy #shorts',
    'The audacity of this cat 😂 #cats #funny #shorts',
    'Baby animals being baby animals 🥰 #babyanimals #shorts',
    'Dog has entered unhinged mode 😹 #dogs #funny #shorts',
    'This kitten thinks its a lion 😂 #cats #kitten #shorts',
    'Puppy zoomies activated 😹 #dogs #puppy #shorts',
    'Baby duck being adorable 🥰 #babyanimals #cute #shorts',
    'Cat caught in 4K being chaotic 😂 #cats #funny #shorts',
    'Golden retriever puppy melts hearts 🥰 #dogs #shorts',
    'When cats choose violence 😹 #cats #funny #shorts',
    'This puppy just discovered snow 😂 #dogs #cute #shorts',
    'Baby goat says hello 🥰 #babyanimals #cute #shorts',
    'Cat vs gravity: cat lost 😹 #cats #funny #shorts',
  ];

  var index = (day * 3 + Math.floor(hour / 8)) % titles.length;

  return {
    title: titles[index],
    description: '😂 Daily funny cats, dogs & baby animals!\n' +
      'Subscribe to Funny Animals Daily for new videos every day!\n\n' +
      '#FunnyAnimals #CuteCats #FunnyDogs #BabyAnimals #Pets ' +
      '#Shorts #Cats #Dogs #Kitten #Puppy #Cute #Funny #Viral',
    tags: [
      'funny cats', 'cute cats', 'funny dogs', 'cute dogs',
      'baby animals', 'kitten', 'puppy', 'cute pets',
      'funny animals', 'animal videos', 'shorts', 'viral',
      'cats being cats', 'dogs being dogs', 'baby animals cute',
      'funny animal moments', 'cute animal videos',
    ],
  };
}

// ─── YOUTUBE UPLOAD ───────────────────────────────────────
async function uploadToYouTube(meta, videoPath, thumbnailPath) {
  console.log('YouTube a yukleniyor...');

  var oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    'http://localhost:3000/callback'
  );
  oauth2Client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
  var youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  var res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: '15',
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: fs.createReadStream(videoPath) },
  });

  var videoId = res.data.id;
  console.log('Video yuklendi: https://youtube.com/shorts/' + videoId);

  try {
    await youtube.thumbnails.set({
      videoId: videoId,
      media: { body: fs.createReadStream(thumbnailPath) },
    });
    console.log('Thumbnail yuklendi');
  } catch(e) {
    console.log('Thumbnail hatasi:', e.message);
  }

  return videoId;
}

// ─── ANA FONKSİYON ───────────────────────────────────────
async function main() {
  console.log('Funny Animals Daily - Video uretiliyor...\n');
  var tempFiles = [];

  try {
    var videos = await downloadAnimalVideos();
    tempFiles = tempFiles.concat(videos);

    var musicPath = selectMusic();

    var finalVideo = await createFinalVideo(videos, musicPath);
    tempFiles.push(finalVideo);

    var thumbnail = await createThumbnail(videos[0]);
    tempFiles.push(thumbnail);

    var meta = getMetadata();
    console.log('Baslik:', meta.title);

    var videoId = await uploadToYouTube(meta, finalVideo, thumbnail);

    tempFiles.forEach(function(f) { try { fs.unlinkSync(f); } catch(e) {} });

    console.log('\nBASARILI!');
    console.log('https://youtube.com/shorts/' + videoId);
    process.exit(0);

  } catch(error) {
    tempFiles.forEach(function(f) { try { fs.unlinkSync(f); } catch(e) {} });
    console.error('\nHATA:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
