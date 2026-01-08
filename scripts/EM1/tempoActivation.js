let scenes_config = {
  cloud_url: "https://xxxx.shelly.cloud",
  auth_key: "xxxxx",
}


function checkTomorrowTempoSetting(){
  let color = "undefined"
  Shelly.call(
    "HTTP.GET",
    {"url": "http://www.api-couleur-tempo.fr/api/jourTempo/tomorrow"},
    function (response) {
      if (response && response.code && response.code === 200) {
        color = JSON.parse(response.body).libCouleur;
        print("Tomorrow's color is " + color)
        let scene = 0
        if (color == "Bleu" || color == "Blanc"){
          scene = 1731165810950
        }
        if (color == "Rouge"){
          scene = 1731165550729
        }
        Shelly.call(
          "HTTP.GET",
          {"url": scenes_config.cloud_url + "/scene/manual_run?id="+scene+"&auth_key=" + scenes_config.auth_key},
          function (response) {
            if (response && response.code && response.code === 200) {
              // Deactivate schedules relateed to the current script
              let currentScriptId = Shelly.getCurrentScriptId()
              Shelly.call('Schedule.List', null,
                function (response, error_code, error_message) {
                  if(error_code != 0){
                    console.log("Error calling Schedule.List " + error_code + " - message: '" + error_message + "'");
                    return;
                  }
                  for (job in response.jobs){
                    for(call in response.jobs[job].calls){
                      if (response.jobs[job].calls[call].params.id == currentScriptId){
                        console.log("Deactivating schedule "+response.jobs[job].id)
                        Shelly.call('Schedule.Update', {"id": response.jobs[job].id, "enable":false},
                          function (response, error_code, error_message) {
                            if(error_code != 0){
                              console.log("Error calling Schedule.Update " + error_code + " - message: '" + error_message + "'");
                              return;
                            }
                          }
                        )
                      }
                    }
                  }
                }
              )
            }
          }
        );
      }
    }
  );
}

function stopScript(){
  Shelly.call('Script.Stop', {"id": Shelly.getCurrentScriptId()},
    function (response, error_code, error_message) {
    }
  )
}

checkTomorrowTempoSetting();
Timer.set(10000, false, stopScript)