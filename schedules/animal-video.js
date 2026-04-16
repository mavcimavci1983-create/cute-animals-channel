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

// Video tipini belirle (saat bazlı)
function getVideoTheme() {
  // Her zaman eğlenceli/komik
  return 'funny';
}

// Tema bazlı Pexels sorguları
function getPexelsQueries(theme) {
  var funnyQueries = [
    'funny cat playing',
    'cute dog running funny',
    'baby goat jumping playing',
    'funny bunny eating',
    'cute hamster running wheel',
    'puppy playing ball funny',
    'kitten chasing toy funny',
    'dog shaking head funny',
  ];

  var cuteQueries = [
    'cute cat sleeping cozy',
    'adorable puppy cuddling',
    'baby duck swimming cute',
    'cute rabbit eating vegetables',
    'tiny kitten yawning cute',
    'fluffy cat grooming',
    'baby animals cute nature',
    'golden retriever puppy cute',
  ];

  var queries = theme === 'funny' ? funnyQueries : cuteQueries;

  // Her gün farklı sorgular için tarihe göre seç
  var day = new Date().getDay();
  var start = (day * 2) % queries.length;
  return [
    queries[start % queries.length],
    queries[(start + 1) % queries.length],
    queries[(start + 2) % queries.length],
    queries[(start + 3) % queries.length],
    queries[(start + 4) % queries.length],
  ];
}

// Pexels'tan video indir
async function downloadAnimalVideos(theme) {
  console.log('Hayvan videolari indiriliyor, tema:', theme);
  var queries = getPexelsQueries(theme);
  var paths = [];

  for (var i = 0; i < queries.length; i++) {
    try {
      // Önce portrait dene
      var response = await fetch(
        'https://api.pexels.com/videos/search?query=' +
        encodeURIComponent(queries[i]) + '&per_page=10&orientation=portrait',
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      var data = await response.json();
      var videos = data.videos || [];

      // Portrait bulamazsa landscape dene
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
        console.log('  Video bulunamadi:', queries[i]);
        continue;
      }

      // En iyi kaliteyi seç, 30 saniyeden kısa olanı tercih et
      var video = videos.find(function(v) { return v.duration <= 30; }) || videos[0];
      var vf = video.video_files
        .filter(function(f) { return f.width && f.height; })
        .sort(function(a, b) { return b.height - a.height; })[0];

      if (!vf) continue;

      var vPath = '/tmp/animal_' + i + '.mp4';
      console.log('  İndiriliyor:', queries[i], '(' + video.duration + 's)');
      await downloadFile(vf.link, vPath);
      paths.push({ path: vPath, duration: video.duration });
      await sleep(400);

    } catch(e) {
      console.log('  Pexels hata:', queries[i], e.message);
    }
  }

  console.log(paths.length, 'hayvan videosu indirildi');
  if (paths.length < 2) throw new Error('Yeterli video indirilemedi: ' + paths.length);
  return paths;
}

// Müzik dosyasını seç
function selectMusic(theme) {
  var musicDir = path.join(__dirname, '..', 'music');
  var files = fs.readdirSync(musicDir);

  var themeFiles = files.filter(function(f) {
    return f.startsWith(theme) && f.endsWith('.mp3');
  });

  if (themeFiles.length === 0) {
    // Fallback: herhangi bir müzik
    themeFiles = files.filter(function(f) { return f.endsWith('.mp3'); });
  }

  if (themeFiles.length === 0) throw new Error('Muzik dosyasi bulunamadi!');

  // Günlük rotasyon
  var day = new Date().getDay();
  var selected = themeFiles[day % themeFiles.length];
  var musicPath = path.join(musicDir, selected);
  console.log('Muzik secildi:', selected);
  return musicPath;
}

// Thumbnail oluştur
async function createThumbnail(videoPath, theme) {
  console.log('Thumbnail olusturuluyor...');

  await new Promise(function(resolve, reject) {
    ffmpeg(videoPath)
      .outputOptions([
        '-vframes 1',
        '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      ])
      .output('/tmp/thumb_raw.jpg')
      .on('end', resolve).on('error', reject).run();
  });

  var emoji = theme === 'funny' ? '😂' : '🥰';
  var title = theme === 'funny' ? 'SO FUNNY!' : 'SO CUTE!';
  var sub = theme === 'funny' ? 'Try not to laugh 😂' : 'Adorable animals 🥰';

  await runCommand(
    'ffmpeg -y -i /tmp/thumb_raw.jpg ' +
    '-vf "' +
    'drawtext=text=\'' + title + '\':fontsize=110:fontcolor=white:x=(w-text_w)/2:y=80:shadowcolor=black:shadowx=5:shadowy=5,' +
    'drawtext=text=\'' + sub + '\':fontsize=50:fontcolor=yellow:x=(w-text_w)/2:y=220:shadowcolor=black:shadowx=3:shadowy=3' +
    '" /tmp/thumbnail.jpg'
  );

  console.log('Thumbnail hazir');
  return '/tmp/thumbnail.jpg';
}

// Ana video montajı
async function createFinalVideo(videoPaths, musicPath, theme) {
  console.log('Video montaji yapiliyor...');

  var TARGET_DURATION = 55; // Shorts max
  var clipCount = Math.min(videoPaths.length, 5);
  var clipDuration = TARGET_DURATION / clipCount;
  var trimmed = [];

  // Her klibi dikey formata çevir
  for (var i = 0; i < clipCount; i++) {
    var tp = '/tmp/trimmed_' + i + '.mp4';
    var inputDur = Math.min(clipDuration, videoPaths[i].duration || clipDuration);

    await new Promise(function(resolve, reject) {
      ffmpeg(videoPaths[i].path)
        .outputOptions([
          '-t ' + clipDuration,
          // Dikey format + güzel crop
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
    console.log('  Klip', i + 1, '/', clipCount, 'hazir');
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

  // Müzik ekle — video süresine göre loop veya kes
  var finalPath = '/tmp/final_animal.mp4';
  await new Promise(function(resolve, reject) {
    ffmpeg()
      .input(mergedPath)
      .input(musicPath)
      .inputOptions(['-stream_loop -1']) // Müziği loop yap
      .outputOptions([
        '-map 0:v:0',
        '-map 1:a:0',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
        '-shortest', // Video bitince dur
        '-movflags +faststart',
        // Ses fade out son 2 saniye
        '-af afade=t=out:st=' + (TARGET_DURATION - 2) + ':d=2',
      ])
      .output(finalPath)
      .on('end', resolve).on('error', reject).run();
  });

  var stats = fs.statSync(finalPath);
  console.log('Final video:', (stats.size / 1024 / 1024).toFixed(1), 'MB');
  return finalPath;
}

// YouTube metadata
function getMetadata(theme) {
  var day = new Date().getDay();

  var funnyTitles = [
    'Funny Animals That Will Make You Laugh 😂 #Shorts',
    'Try Not To Laugh - Funniest Animals 🐱🐶 #Shorts',
    'Hilarious Animals Compilation 😂 #Shorts',
    'Funny Cats and Dogs Moments 😹 #Shorts',
    'Animals Being Goofballs 🐾 #Shorts',
    'When Animals Are Too Funny 😂 #Shorts',
    'Funniest Animal Moments Of The Day 🐶 #Shorts',
  ];

  var cuteTitles = [
    'Cute Animals That Will Melt Your Heart 🥰 #Shorts',
    'Adorable Baby Animals Compilation 🐾 #Shorts',
    'The Cutest Animals You Will See Today 😍 #Shorts',
    'Sweet Animal Moments That Heal Your Soul 🥰 #Shorts',
    'Precious Animals Being Adorable 💕 #Shorts',
    'Cutest Animal Videos To Brighten Your Day ☀️ #Shorts',
    'Baby Animals So Cute It Hurts 🥺 #Shorts',
  ];

  var titles = theme === 'funny' ? funnyTitles : cuteTitles;
  var title = titles[day % titles.length];

  var tags = theme === 'funny'
    ? ['funny animals', 'funny cats', 'funny dogs', 'animal fails', 'cute pets', 'shorts', 'animals']
    : ['cute animals', 'adorable pets', 'baby animals', 'cute cats', 'cute dogs', 'shorts', 'animals'];

  var hashtags = theme === 'funny'
    ? '#FunnyAnimals #FunnyCats #FunnyDogs #Pets #Shorts #Animals #Cute'
    : '#CuteAnimals #AdorablePets #BabyAnimals #CuteCats #CuteDogs #Shorts #Animals';

  return {
    title: title,
    description: theme === 'funny'
      ? 'Daily dose of funny animals! 😂 Watch the funniest animal moments. Like & Subscribe for more!\n\n' + hashtags
      : 'Daily dose of cute animals! 🥰 The most adorable animal moments. Like & Subscribe for more!\n\n' + hashtags,
    tags: tags,
  };
}

// YouTube'a yükle
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
        categoryId: '15', // Pets & Animals
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

// Ana fonksiyon
async function main() {
  console.log('Hayvan videosu uretiliyor...\n');

  var theme = getVideoTheme();
  console.log('Tema:', theme, '| Saat:', (new Date().getUTCHours() + 3) % 24);

  var tempFiles = [];

  try {
    // 1. Videoları indir
    var videos = await downloadAnimalVideos(theme);
    tempFiles = tempFiles.concat(videos.map(function(v) { return v.path; }));

    // 2. Müzik seç
    var musicPath = selectMusic(theme);

    // 3. Video montajı
    var finalVideo = await createFinalVideo(videos, musicPath, theme);
    tempFiles.push(finalVideo);

    // 4. Thumbnail
    var thumbnail = await createThumbnail(videos[0].path, theme);
    tempFiles.push(thumbnail);

    // 5. YouTube'a yükle
    var meta = getMetadata(theme);
    var videoId = await uploadToYouTube(meta, finalVideo, thumbnail);

    // Temizlik
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
