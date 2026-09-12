/* ==========================================================================
   景点配图映射：景点名 → 图片 URL
   来源：Wikimedia Commons（CC BY / CC BY-SA / PD / CC0，署名见各文件的 Commons 页面）

   两点注意：
   1) Wikimedia 只接受固定几档缩略图宽度（250/330/500/960/1280/1920/3840），
      自定义宽度（如 800px-）会返回 HTTP 400，所以这里统一用 960px。
   2) 缺图或加载失败时，卡片自动回退到内置 SVG 占位插画，离线不会开天窗。
   ========================================================================== */
const SPOT_IMG = {
  '清水寺':        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Kiyomizu.jpg/960px-Kiyomizu.jpg',
  '金阁寺':        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Golden_Pavilion_Kinkaku-ji_water_mirror_2024.jpg/960px-Golden_Pavilion_Kinkaku-ji_water_mirror_2024.jpg',
  '龙安寺':        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Kare-sansui_zen_garden%2C_Ry%C5%8Dan-ji%2C_Kyoto_20190416_1.jpg/960px-Kare-sansui_zen_garden%2C_Ry%C5%8Dan-ji%2C_Kyoto_20190416_1.jpg',
  '岚山竹林':      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/2021_Sagano_Bamboo_forest_in_Arashiyama%2C_Kyoto%2C_Japan.jpg/960px-2021_Sagano_Bamboo_forest_in_Arashiyama%2C_Kyoto%2C_Japan.jpg',
  '天龙寺':        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Tenryuji_Kyoto.jpg/960px-Tenryuji_Kyoto.jpg',
  '渡月桥':        'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Togetsukyo_in_Kyoto_Arashiyama.jpg/960px-Togetsukyo_in_Kyoto_Arashiyama.jpg',
  '锦市场':        'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Nishiki_Ichiba_by_matsuyuki.jpg/960px-Nishiki_Ichiba_by_matsuyuki.jpg',
  '二条城':        'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/NinomaruPalace.jpg/960px-NinomaruPalace.jpg',
  '银阁寺':        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Ginkakuji_Kyoto03-r.jpg/960px-Ginkakuji_Kyoto03-r.jpg',
  '哲学之道':      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Japan_Kyoto_philosophers_walk_DSC00297.jpg/960px-Japan_Kyoto_philosophers_walk_DSC00297.jpg',
  '京都国立博物馆':'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/260214_Kyoto_National_Museum_Kyoto_Japan04bs4.jpg/960px-260214_Kyoto_National_Museum_Kyoto_Japan04bs4.jpg',
  '三十三间堂':    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Sanjusangendo_2022.jpg/960px-Sanjusangendo_2022.jpg',
  '平安神宫':      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Heian-jing%C5%AB_daigokuden.jpg/960px-Heian-jing%C5%AB_daigokuden.jpg',
  '先斗町':        'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Pontocho_by_Wolfiewolf_in_Nabeyacho%2C_Kyoto.jpg/960px-Pontocho_by_Wolfiewolf_in_Nabeyacho%2C_Kyoto.jpg',
  '鸭川河畔':      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Kamogawa_sakura.jpg/960px-Kamogawa_sakura.jpg',
  '京都塔':        'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/%E4%BA%AC%E9%83%BD%E3%82%BF%E3%83%AF%E3%83%BC%E5%A4%9C%E6%99%AF.jpg/960px-%E4%BA%AC%E9%83%BD%E3%82%BF%E3%83%AF%E3%83%BC%E5%A4%9C%E6%99%AF.jpg',
  '东寺':          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Toji_2015.JPG/960px-Toji_2015.JPG',
  '南禅寺':        'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/251213_Nanzen-ji_Kyoto_Japan01s3.jpg/960px-251213_Nanzen-ji_Kyoto_Japan01s3.jpg',
  '祇园花见小路':  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/150124_Gion_Kyoto_Japan01s3.jpg/960px-150124_Gion_Kyoto_Japan01s3.jpg',
  '二年坂三年坂':  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Sannenzaka_street%2C_Kyoto_%283811257874%29.jpg/960px-Sannenzaka_street%2C_Kyoto_%283811257874%29.jpg',
  '伏见稻荷大社':  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg/960px-Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg',
  '京都站':        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Kyoto-STA_Central.jpg/960px-Kyoto-STA_Central.jpg',
  '西阵':          'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Kyoto_Nishijin_Textile_show.jpg/960px-Kyoto_Nishijin_Textile_show.jpg',
  '出町柳桝形商店街':'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Demachiyanagi_station_building_20221008.jpg/960px-Demachiyanagi_station_building_20221008.jpg',
  '嵯峨野':        'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Arashiyama%2C_Part_II_-_Arashiyama7534.jpg/960px-Arashiyama%2C_Part_II_-_Arashiyama7534.jpg',
  '京都站伊势丹':  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/JR-Kyoto-Isetan-01.jpg/960px-JR-Kyoto-Isetan-01.jpg'
};
