function checkTomorrowTempoSetting(){
  let color = "undefined"
  Shelly.call(
    "HTTP.GET",
    {"url": "http://www.api-couleur-tempo.fr/api/jourTempo/tomorrow"},
    function (response) {
      if (response && response.code && response.code === 200) {
        color = JSON.parse(response.body).libCouleur;
        print(color)
        let scene = 0
        if (color == "Bleu" || color == "Blanc"){
          scene = 1731165810950
        }
        if (color == "Rouge"){
          scene = 1731165550729
        }
        Shelly.call(
          "HTTP.GET",
          {"url": "https://shelly-93-eu.shelly.cloud/scene/manual_run?id="+scene+"&auth_key=MjE5NzEwdWlkF1B50D9D3F30723EDDBE49D8141ACCD569B26CC36BE77C0D350D1F1F97D1B7BC0E7F720C60936D38"},
          function (response) {
            // if (response && response.code && response.code === 200) {
               // print(JSON.parse(response.body))
            // }
          }
        );
      }
    }
  );
}

checkTomorrowTempoSetting();