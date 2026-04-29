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

// ─── HAYVAN AİLESİ SİSTEMİ ───────────────────────────────
function getAnimalTheme() {
  var now = new Date();
  var seed = now.getDate() * 10 + now.getUTCHours();

  var themes = [
    {
      animal: 'Lion',
      queries: [
        'lion pride family cubs playing',
        'lioness cubs nursing wildlife',
        'lion father family savanna',
        'lion cubs playing together',
        'lion family resting savanna',
      ],
      musicQuery: 'epic wildlife nature documentary',
      title: 'Lion Family Moments 🦁 #wildlife #shorts',
      tags: ['lion', 'wildlife', 'cubs', 'family', 'nature', 'shorts', 'animals'],
    },
    {
      animal: 'Leopard',
      queries: [
        'leopard mother cub tree',
        'leopard cub playing mother',
        'leopard family wildlife africa',
        'leopard hunting teaching cub',
        'leopard cubs siblings playing',
      ],
      musicQuery: 'calm nature ambient wildlife',
      title: 'Leopard Family in the Wild 🐆 #wildlife #shorts',
      tags: ['leopard', 'wildlife', 'cubs', 'family', 'nature', 'shorts', 'africa'],
    },
    {
      animal: 'Wolf',
      queries: [
        'wolf pack family pups playing',
        'wolf mother pups nursing',
        'wolf family howling together',
        'wolf pups playing siblings',
        'wolf pack hunting together',
      ],
      musicQuery: 'epic cinematic nature wolves',
      title: 'Wolf Pack Family Life 🐺 #wildlife #shorts',
      tags: ['wolf', 'wildlife', 'pups', 'pack', 'nature', 'shorts', 'wolves'],
    },
    {
      animal: 'Bear',
      queries: [
        'bear mother cubs forest',
        'bear cubs playing mother',
        'grizzly bear family river fish',
        'bear cub climbing tree mother',
        'bear family wilderness nature',
      ],
      musicQuery: 'peaceful nature forest ambient',
      title: 'Bear Family Adventures 🐻 #wildlife #shorts',
      tags: ['bear', 'wildlife', 'cubs', 'family', 'nature', 'shorts', 'grizzly'],
    },
    {
      animal: 'Tiger',
      queries: [
        'tiger mother cubs jungle',
        'tiger cubs playing together',
        'tiger family water swimming',
        'tiger cub learning hunting',
        'white tiger family cubs',
      ],
      musicQuery: 'dramatic epic wildlife nature',
      title: 'Tiger Family in the Jungle 🐯 #wildlife #shorts',
      tags: ['tiger', 'wildlife', 'cubs', 'family', 'nature', 'shorts', 'jungle'],
    },
    {
      animal: 'Elephant',
      queries: [
        'elephant family baby herd',
        'elephant mother baby calf',
        'elephant herd playing water',
        'elephant calf nursing mother',
        'elephant family savanna africa',
      ],
      musicQuery: 'majestic epic african nature',
      title: 'Elephant Family Bond 🐘 #wildlife #shorts',
      tags: ['elephant', 'wildlife', 'calf', 'family', 'nature', 'shorts', 'africa'],
    },
    {
      animal: 'Cheetah',
      queries: [
        'cheetah mother cubs savanna',
        'cheetah cubs playing together',
        'cheetah family hunting teaching',
        'cheetah cub learning mother',
        'cheetah family resting tree',
      ],
      musicQuery: 'fast paced exciting wildlife nature',
      title: 'Cheetah Family on the Hunt 🐆 #wildlife #shorts',
      tags: ['cheetah', 'wildlife', 'cubs', 'family', 'nature', 'shorts', 'savanna'],
    },
    {
      animal: 'Fox',
      queries: [
        'fox family kits playing',
        'fox mother kits den',
        'red fox cubs playing together',
        'fox family forest nature',
        'fox father mother kits',
      ],
      musicQuery: 'cute playful nature ambient',
      title: 'Fox Family Playing Together 🦊 #wildlife #shorts',
      tags: ['fox', 'wildlife', 'kits', 'family', 'nature', 'shorts', 'cute'],
    },
  ];

  return themes[seed % themes.length];
}

// ─── PEXELS VİDEO İNDİR ──────────────────────────────────
async function downloadWildlifeVideos(theme) {
  console.log('Wildlife videos downloading:', theme.animal);
  var paths = [];
  var usedIds = [];
  var now = new Date();
  var page = (now.getDate() % 3) + 1;

  for (var i = 0; i < theme.queries.length; i++) {
    if (paths.length >= 5) break;

    try {
      // Portrait dene
      var response = await fetch(
        'https://api.pexels.com/videos/search?query=' +
        encodeURIComponent(theme.queries[i]) +
        '&per_page=10&orientation=portrait&page=' + page,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      var data = await response.json();
      var videos = data.videos || [];

      // Landscape dene
      if (videos.length === 0) {
        response = await fetch(
          'https://api.pexels.com/videos/search?query=' +
          encodeURIComponent(theme.queries[i]) +
          '&per_page=10&page=' + page,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        data = await response.json();
        videos = data.videos || [];
      }

      for (var j = 0; j < videos.length; j++) {
        if (paths.length >= 5) break;
        if (usedIds.indexOf(videos[j].id) !== -1) continue;

        var vf = videos[j].video_files
          .filter(function(f) { return f.width && f.height; })
          .sort(function(a, b) { return b.height - a.height; })[0];

        if (!vf) continue;

        usedIds.push(videos[j].id);
        var vPath = '/tmp/wildlife_' + paths.length + '.mp4';
        console.log('  Downloading:', theme.queries[i], '| ID:', videos[j].id);
        await downloadFile(vf.link, vPath);
        paths.push(vPath);
        await sleep(400);
      }
    } catch(e) {
      console.log('  Error:', theme.queries[i], e.message);
    }
  }

  console.log(paths.length, 'videos downloaded');
  if (paths.length < 2) throw new Error('Not enough videos: ' + paths.length);
  return paths;
}

// ─── MÜZİK İNDİR (Pixabay) ───────────────────────────────
async function downloadMusic(query) {
  console.log('Downloading music:', query);
  try {
    var musicDir = path.join(__dirname, '..', 'music');
    var files = fs.readdirSync(musicDir).filter(function(f) { return f.endsWith('.mp3'); });

    if (files.length > 0) {
      var now = new Date();
      var index = (now.getDate() * 7 + now.getUTCHours()) % files.length;
      var selected = path.join(musicDir, files[index]);
      console.log('Using local music:', files[index]);
      return selected;
    }
  } catch(e) {
    console.log('Local music error:', e.message);
  }
  return null;
}

// ─── THUMBNAIL ────────────────────────────────────────────
async function createThumbnail(videoPath, theme) {
  console.log('Creating thumbnail...');

  await new Promise(function(resolve, reject) {
    ffmpeg(videoPath)
      .outputOptions([
        '-vframes 1',
        '-ss 00:00:03',
        '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
      ])
      .output('/tmp/thumb_raw.jpg')
      .on('end', resolve).on('error', reject).run();
  });

  var animalEmojis = {
    Lion: '🦁', Leopard: '🐆', Wolf: '🐺',
    Bear: '🐻', Tiger: '🐯', Elephant: '🐘',
    Cheetah: '🐆', Fox: '🦊',
  };
  var emoji = animalEmojis[theme.animal] || '🦁';

  var texts = [
    { top: 'WILD', bottom: 'FAMILY BOND' + ' ' + emoji },
    { top: 'NATURE', bottom: 'AT ITS BEST ' + emoji },
    { top: 'WILD', bottom: 'FAMILY LIFE ' + emoji },
    { top: 'AMAZING', bottom: 'WILDLIFE ' + emoji },
  ];
  var t = texts[new Date().getDate() % texts.length];

  await runCommand(
    'ffmpeg -y -i /tmp/thumb_raw.jpg ' +
    '-vf "' +
    'drawbox=x=0:y=0:w=1080:h=300:color=black@0.7:t=fill,' +
    'drawbox=x=0:y=1620:w=1080:h=300:color=black@0.7:t=fill,' +
    'drawtext=text=\'' + t.top + '\':fontsize=120:fontcolor=white:x=(w-text_w)/2:y=70:shadowcolor=black:shadowx=6:shadowy=6,' +
    'drawtext=text=\'' + t.bottom + '\':fontsize=70:fontcolor=yellow:x=(w-text_w)/2:y=1640:shadowcolor=black:shadowx=4:shadowy=4" ' +
    '/tmp/thumbnail.jpg'
  );

  console.log('Thumbnail ready');
  return '/tmp/thumbnail.jpg';
}

// ─── VİDEO MONTAJI ───────────────────────────────────────
async function createFinalVideo(videoPaths, musicPath) {
  console.log('Creating wildlife video...');

  var TARGET = 57;
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
        .on('end', resolve).on('error', reject).run();
    });
    trimmed.push(tp);
    console.log('  Clip', i + 1, '/', count, 'ready');
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

  var finalPath = '/tmp/final_wildlife.mp4';

  if (musicPath && fs.existsSync(musicPath)) {
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
  } else {
    // Müzik yoksa sessiz
    await runCommand('ffmpeg -y -i ' + mergedPath + ' -c copy ' + finalPath);
  }

  var stats = fs.statSync(finalPath);
  console.log('Video ready:', (stats.size / 1024 / 1024).toFixed(1), 'MB');
  return finalPath;
}

// ─── METADATA ─────────────────────────────────────────────
function getMetadata(theme) {
  var now = new Date();
  var day = now.getDay();
  var hour = (now.getUTCHours() + 3) % 24;

  var descriptions = [
    'Watch this incredible ' + theme.animal + ' family moment in the wild! 🌿\nNature at its most beautiful. Like & Subscribe for daily wildlife!\n\n',
    'Amazing ' + theme.animal + ' family bond captured in the wild! 🦁\nSubscribe for daily wildlife videos!\n\n',
    'This ' + theme.animal + ' family will melt your heart! 🌿\nNew wildlife videos every day. Subscribe!\n\n',
  ];

  return {
    title: theme.title,
    description: descriptions[day % descriptions.length] +
      '#Wildlife #' + theme.animal + ' #Nature #WildAnimals #Shorts #Animals #Family #Cubs #WildLife',
    tags: theme.tags,
  };
}

// ─── YOUTUBE UPLOAD ───────────────────────────────────────
async function uploadToYouTube(meta, videoPath, thumbnailPath) {
  console.log('Uploading to YouTube...');

  var oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, 'http://localhost:3000/callback'
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
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });

  var videoId = res.data.id;
  console.log('Uploaded: https://youtube.com/shorts/' + videoId);

  try {
    await youtube.thumbnails.set({
      videoId: videoId,
      media: { body: fs.createReadStream(thumbnailPath) },
    });
    console.log('Thumbnail uploaded');
  } catch(e) { console.log('Thumbnail error:', e.message); }

  return videoId;
}

// ─── ANA FONKSİYON ───────────────────────────────────────
async function main() {
  console.log('Wildlife Family Channel - Creating video...\n');
  var tempFiles = [];

  try {
    var theme = getAnimalTheme();
    console.log('Animal:', theme.animal);

    var videos = await downloadWildlifeVideos(theme);
    tempFiles = tempFiles.concat(videos);

    var musicPath = await downloadMusic(theme.musicQuery);

    var finalVideo = await createFinalVideo(videos, musicPath);
    tempFiles.push(finalVideo);

    var thumbnail = await createThumbnail(videos[0], theme);
    tempFiles.push(thumbnail);

    var meta = getMetadata(theme);
    console.log('Title:', meta.title);

    var videoId = await uploadToYouTube(meta, finalVideo, thumbnail);
    tempFiles.forEach(function(f) { try { fs.unlinkSync(f); } catch(e) {} });

    console.log('\nSUCCESS! https://youtube.com/shorts/' + videoId);
    process.exit(0);

  } catch(error) {
    tempFiles.forEach(function(f) { try { fs.unlinkSync(f); } catch(e) {} });
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
