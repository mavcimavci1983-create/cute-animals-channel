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

// ─── YARDIMCILAR ─────────────────────────────────────────

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

// ─── PEXELS SORGULARI ────────────────────────────────────

function getPexelsQueries() {
  var allQueries = [
    'funny cat fails',
    'dog playing funny',
    'baby goat jumping',
    'funny hamster running wheel',
    'puppy zoomies',
    'cat scared funny',
    'dog fail funny',
    'kitten playing attacking',
    'funny rabbit',
    'corgi running',
    'cat knocking things',
    'dog confused funny',
    'baby duck walking',
    'cat box funny',
    'dog eating messy funny',
    'goat screaming',
    'cat mirror reaction',
    'puppy howling',
    'dog zoomies grass',
    'animals funny compilation',
    'cat chattering',
    'puppy playing ball',
    'dog shaking head',
    'cat loaf funny',
    'ferret playing funny',
    'bunny binkying',
    'dog tail chasing',
    'cat spinning funny',
    'puppy hiccups',
    'dog head tilt funny',
  ];

  var now = new Date();
  var seed = now.getDate() * 100 + now.getUTCHours();
  var start = seed % allQueries.length;
  var selected = [];

  for (var i = 0; i < 8; i++) {
    selected.push(allQueries[(start + i * 4) % allQueries.length]);
  }

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
      // Önce portrait dene
      var response = await fetch(
        'https://api.pexels.com/videos/search?query=' +
        encodeURIComponent(queries[i]) + '&per_page=10&orientation=portrait',
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      var data = await response.json();
      var videos = data.videos || [];

      // Bulamazsa landscape dene
      if (videos.length === 0) {
        response = await fetch(
          'https://api.pexels.com/videos/search?query=' +
          encodeURIComponent(queries[i]) + '&per_page=10',
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        data = await response.json();
        videos = data.videos || [];
      }

      if (videos.length === 0) {
        console.log('  Bulunamadi:', queries[i]);
        continue;
      }

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

      // En iyi kaliteyi seç
      var vf = video.video_files
        .filter(function(f) { return f.width && f.height; })
        .sort(function(a, b) { return b.height - a.height; })[0];

      if (!vf) continue;

      var vPath = '/tmp/animal_' + paths.length + '.mp4';
      console.log('  İndiriliyor:', queries[i], '| ID:', video.id, '| Sure:', video.duration + 's');
      await downloadFile(vf.link, vPath);
      paths.push({ path: vPath, duration: video.duration });
      await sleep(400);

    } catch(e) {
      console.log('  Hata:', queries[i], e.message);
    }
  }

  console.log(paths.length, 'video indirildi');
  if (paths.length < 2) throw new Error('Yeterli video yok: ' + paths.length);
  return paths;
}

// ─── MÜZİK SEÇ ───────────────────────────────────────────

function selectMusic() {
  var musicDir = path.join(__dirname, '..', 'music');
  var files = fs.readdirSync(musicDir).filter(function(f) {
    return f.endsWith('.mp3');
  });

  if (files.length === 0) throw new Error('Muzik dosyasi bulunamadi!');

  // Gün + saate göre farklı müzik
  var now = new Date();
  var index = (now.getDate() + now.getUTCHours()) % files.length;
  var selected = files[index];
  console.log('Muzik:', selected);
  return path.join(musicDir, selected);
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

  // Trend thumbnail formatı — emoji + büyük metin + kontrast
  var now = new Date();
  var texts = [
    { top: 'WAIT FOR IT', bottom: '😂 So Funny!' },
    { top: 'I CANT STOP', bottom: '😹 Laughing!' },
    { top: 'THIS IS TOO', bottom: '😂 Much!' },
    { top: 'NO WAY THIS', bottom: '😹 Happened!' },
    { top: 'WATCH TILL', bottom: '😂 The End!' },
    { top: 'YOU WONT', bottom: '😹 Believe This!' },
    { top: 'POV: BEST', bottom: '🐾 Pet Ever!' },
    { top: 'CAUGHT ON', bottom: '😂 Camera!' },
  ];
  var t = texts[now.getDate() % texts.length];

  await runCommand(
    'ffmpeg -y -i /tmp/thumb_raw.jpg ' +
    '-vf "' +
    // Üst gradient
    'drawbox=x=0:y=0:w=1080:h=300:color=black@0.7:t=fill,' +
    // Alt gradient  
    'drawbox=x=0:y=1620:w=1080:h=300:color=black@0.7:t=fill,' +
    // Üst metin
    'drawtext=text=\'' + t.top + '\':fontsize=115:fontcolor=white:x=(w-text_w)/2:y=80:shadowcolor=black:shadowx=5:shadowy=5,' +
    // Alt metin
    'drawtext=text=\'' + t.bottom + '\':fontsize=95:fontcolor=yellow:x=(w-text_w)/2:y=1650:shadowcolor=black:shadowx=4:shadowy=4" ' +
    '/tmp/thumbnail.jpg'
  );

  console.log('Thumbnail hazir');
  return '/tmp/thumbnail.jpg';
}

// ─── VİDEO MONTAJI ───────────────────────────────────────

async function createFinalVideo(videos, musicPath) {
  console.log('Video montaji yapiliyor...');

  var TARGET = 58;
  var count = Math.min(videos.length, 5);
  var clipDur = TARGET / count;
  var trimmed = [];

  for (var i = 0; i < count; i++) {
    var tp = '/tmp/trimmed_' + i + '.mp4';
    await new Promise(function(resolve, reject) {
      ffmpeg(videos[i].path)
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

  // Klipleri birleştir
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

  // Müzik ekle
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
    'When cats do the UNEXPECTED 😹 #cats #funny #shorts',
    'This dog made everyone laugh 😂 #dogs #funny #shorts',
    'POV: Your pet is a comedian 🐾 #pets #funny #shorts',
    'Try not to laugh at these animals 😂 #animals #shorts',
    'Animals being absolutely unhinged 😹 #funny #shorts',
    'Your daily dose of animal therapy 🐾 #cute #shorts',
    'This little guy has no fear 😂 #animals #funny #shorts',
    'Animals that broke the internet 😹 #viral #shorts',
    'When your pet has main character energy 😂 #pets #shorts',
    'Real reason why we love animals 🥰 #animals #shorts',
    'Animals doing their best impression 😹 #funny #shorts',
    'This made my day instantly 😂 #animals #cute #shorts',
    'POV: Animals are living their best life 🐾 #shorts',
    'Funniest animal moments of the week 😹 #shorts',
    'Animals that deserve an Oscar 😂 #funny #shorts',
    'When animals have zero chill 😹 #cats #dogs #shorts',
    'These animals are too precious 🥰 #cute #shorts',
    'Animals caught in 4K being funny 😂 #shorts',
    'Nobody told them they were being recorded 😹 #shorts',
    'Animals living rent free in my head 😂 #shorts',
    'The most wholesome animal video today 🥰 #shorts',
  ];

  var index = (day * 3 + Math.floor(hour / 8)) % titles.length;

  return {
    title: titles[index],
    description: '😂 Daily funny & cute animal videos!\n' +
      'Like and Subscribe for more animal content every day!\n\n' +
      '#FunnyAnimals #CuteAnimals #Pets #Cats #Dogs #Shorts #Animals #Funny #Viral #PetVideos',
    tags: [
      'funny animals', 'cute animals', 'funny cats', 'funny dogs',
      'pets', 'animals', 'shorts', 'viral', 'funny', 'cute',
      'cat videos', 'dog videos', 'animal videos', 'pet videos',
      'try not to laugh', 'funny pet moments',
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
  console.log('Funny hayvan videosu uretiliyor...\n');
  var tempFiles = [];

  try {
    var videos = await downloadAnimalVideos();
    tempFiles = tempFiles.concat(videos.map(function(v) { return v.path; }));

    var musicPath = selectMusic();

    var finalVideo = await createFinalVideo(videos, musicPath);
    tempFiles.push(finalVideo);

    var thumbnail = await createThumbnail(videos[0].path);
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
