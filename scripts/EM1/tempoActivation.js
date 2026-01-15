let scenes_config = {
  cloud_url: "",
  auth_key: "",
  notif_scene_name: "Autom",
  notif_scene_id: "1768214869764",
}

function customNotif(message){
  Shelly.call(
    "http.request", {
      method: "POST",
      url: scenes_config.cloud_url+'/scene/edit',
      headers: {
          "Content-Type":"application/x-www-form-urlencoded"
       },
       body: 'auth_key=' + scenes_config.auth_key + '&id=' + scenes_config.notif_scene_id + '&scene_script={"if":{"or":[{"and":[{"_gui_type":"manual_execution","_gui_purpose":"condition"}]}]}, "do":[{"notify":"push_notification","msg":"' +
         message + '","_gui_type":"notification","_gui_function":"push_notification"}],"_run_on_ingest":true,"_enabled":true,"_meta":{"name":"' +
         scenes_config.notif_scene_name + '","room":"-1","image":"assets/predefined_images/room/room1.png"},"_id":"' + scenes_config.notif_scene_id + '"}'

    },
    function (response) {
      // print (response)
      if (response && response.code && response.code === 200) {
        Timer.set(5*1000,false,function(){Shelly.call("http.get",
          {url: scenes_config.cloud_url + '/scene/manual_run&auth_key=' + scenes_config.auth_key + '&id=' + scenes_config.notif_scene_id},);},
        null);
      }
    }
  );
}


function playTempoScene(scene_id){
  Shelly.call(
  "HTTP.GET",
  {"url": scenes_config.cloud_url + "/scene/manual_run?id="+scene_id+"&auth_key="+scenes_config.auth_key},
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


function checkTomorrowTempoSetting(){
  let color = "undefined"
  Shelly.call(
    "HTTP.GET",
    {"url": "http://www.api-couleur-tempo.fr/api/jourTempo/tomorrow"},
    function (response) {
      if (response && response.code && response.code === 200) {
        color = JSON.parse(response.body).libCouleur;
        print("Tomorrow's color is " + color)
        let scene_id = 0
        let isNewTempoActive = false
        if (color == "Bleu" || color == "Blanc"){
          scene_id = 1731165810950
        }
        if (color == "Rouge"){
          scene_id = 1731165550729
          isNewTempoActive = true
        }
        if (scene_id == 0){
          return
        }
        // Get the local boolen id 200 isTempoActive
        Shelly.call("Boolean.GetStatus", {"id":"200"},
          function (response, error_code, error_message) {
            if(error_code != 0){
              console.log("Error calling get tempo active state " + error_code + " - message: '" + error_message + "'");
              return;
            }
            isCurrentTempoActive = response.value;
            if(isNewTempoActive != isCurrentTempoActive ){
              // Status change = update indicator
              Shelly.call("Boolean.Set", {"id":"200", "value": isNewTempoActive },
                function (response, error_code, error_message) {
                  if(error_code != 0){
                    console.log("Error calling set tempo active state to " + isNewTempoActive  + " - " + error_code + " - message: '" + error_message + "'");
                    return;
                  }
                  let message = "Tempo mode mis a jour : " + (isNewTempoActive ? "actif" : "inactif");
                  customNotif(message)
                }
              )
            }
            playTempoScene(scene_id)
          }
        )
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



Shelly.call('KVS.Get',
  {"key": "cloud-config"},
  function (response, error_code, error_message) {
    let parsed = JSON.parse(response.value);
    scenes_config.cloud_url = parsed.cloud_url ;
    scenes_config.auth_key = parsed.auth_key;
    checkTomorrowTempoSetting();
  }
)

Timer.set(10000, false, stopScript)