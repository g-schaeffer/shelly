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



let forecast_data = {
  datetimes: [],
  cloud_covers: [],
  radiations: [],
  temperatures: [],
  estimated_productions: [],
  sunrise: "",
  sunset: "",
  tempoActive: true,
}

function getAverage (elements) {
  let sum = 0;
  for(count=0;count<elements.length;count++){
    sum += elements[count];
  }
  return sum / elements.length;
}


function getEstimatePow(ghi){
  // Produced in Wh = GHI * surface * Efficiency
  return ghi * 27.5 * 0.206;
}



function checkTomorrowWeatherAndSetSchedule(){
  let color = "undefined"
  Shelly.call(
    "HTTP.GET",
    {"url": "https://api.open-meteo.com/v1/forecast?latitude=43.7030277778&longitude=6.9979722222&daily=sunrise,sunset&hourly=temperature_2m,shortwave_radiation,cloud_cover&models=meteofrance_seamless&timezone=Europe%2FBerlin&forecast_days=2"},
    function (response) {
      if (response && response.code && response.code === 200) {
        let body = JSON.parse(response.body);
        let times = body.hourly.time;
        let temperatures = body.hourly.temperature_2m;
        let radiations = body.hourly.shortwave_radiation;
        let clouds = body.hourly.cloud_cover;
        let sunrises = body.daily.sunrise;
        let sunsets = body.daily.sunset;

        let unixTimestamp = Shelly.getComponentStatus("sys");
        const date = new Date(unixTimestamp.unixtime* 1000); // + 86400000);

        let tomorrowDate = date.toISOString().substr(0, 10)
        for(let i = 0 ; i < sunrises.length ; i++){
          if(sunrises[i].substr(0, 10) == tomorrowDate ){
            forecast_data.sunrise = sunrises[i];
            break;
          }
        }
        for(let i = 0 ; i < sunsets.length ; i++){
          if(sunsets[i].substr(0, 10) == tomorrowDate ){
            forecast_data.sunset = sunsets[i];
            break;
          }
        }

        for(let i = 0 ; i < times.length ; i++){
          if(times[i].substr(0, 10) == tomorrowDate &&
          times[i] > forecast_data.sunrise &&
          times[i] < forecast_data.sunset
          ){
            forecast_data.datetimes.push(times[i]);
            forecast_data.cloud_covers.push(clouds[i]);
            forecast_data.radiations.push(radiations[i]);
            forecast_data.temperatures.push(temperatures[i]);
            forecast_data.estimated_productions.push(getEstimatePow(radiations[i]))
          }
        }
        // print (forecast_data.radiations)
        average_radiations = getAverage(forecast_data.radiations)
        average_cloud_cover = getAverage(forecast_data.cloud_covers)
        average_temperature = new Number(getAverage(forecast_data.temperatures))

        // total power over 10-11-12 h
        let available_produced_10_13 = 0;
        let total_produced = 0;
        for(let i = 0 ; i < forecast_data.datetimes ; i++){
          total_produced += forecast_data.estimated_productions[i]
          if (forecast_data.datetimes[i] == tomorrowDate+"T10:00"
            || forecast_data.datetimes[i] == tomorrowDate+"T11:00"
            || forecast_data.datetimes[i] == tomorrowDate+"T12:00"
            || forecast_data.datetimes[i] == tomorrowDate+"T13:00"){
            available_produced_10_13 += forecast_data.estimated_productions[i]
          }
        }

        // assume 2kW for 2 hours?
        let REQUIRED_POWER = 4000
        let enough = available_produced_10_13  > REQUIRED_POWER
        print ("Tomorrow estimated production: " + total_produced)

        // poor irradiance:
        // good irradiance:

        // Easy-peasy
        let night_schedule = true
        let message = ""
        if (forecast_data.tempoActive){
          night_schedule = true
          message = "Tempo Rouge demain"
        } else if (!enough){
          night_schedule = true
          message = "production estimée insuffisante (" + new Number(available_produced_10_13).toFixed(1) + "Wh)"
        } else {
          if (average_temperature < 11){
            night_schedule = true
            message = "production estimée suffisante (" + new Number(available_produced_10_13).toFixed(1) + "Wh), température faible (" + average_temperature.toFixed(1) + "°)"
          } else {
            night_schedule = false
            message = "production estimée suffisante (" + new Number(available_produced_10_13).toFixed(1) + "Wh)"
          }
        }
        // night - schedule id = 3
        // day - schedule id = 5
        customNotif("Chauffe-eau en mode " + (night_schedule ? "nuit":"jour") + ": "+message )
        setNightSchedule(night_schedule)

      }
    }
  );
}


function setNightSchedule(night_schedule){
  Shelly.call('Schedule.Update', {"id": 3, "enable":night_schedule },
    function (response, error_code, error_message) {
      if(error_code != 0){
        console.log("Error calling Schedule.Update Night " + error_code + " - message: '" + error_message + "'");
        return;
      }
      Shelly.call('Schedule.Update', {"id": 5, "enable":!night_schedule },
        function (response, error_code, error_message) {
          if(error_code != 0){
            console.log("Error calling Schedule.Update Day " + error_code + " - message: '" + error_message + "'");
            return;
          }
        }
      )
    }
  )
}



function getTomorrowTempoStatusAndThenTomorrowWeather(){
  let color = "undefined"
  Shelly.call(
    "HTTP.GET",
    {"url": "http://www.api-couleur-tempo.fr/api/jourTempo/tomorrow"},
    function (response) {
      if (response && response.code && response.code === 200) {
        color = JSON.parse(response.body).libCouleur;
        print("Tomorrow's color is " + color)
        if (color == "Bleu" || color == "Blanc"){
          forecast_data.tempoActive = false
        }
        checkTomorrowWeatherAndSetSchedule()
      }
    }
  )
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
    getTomorrowTempoStatusAndThenTomorrowWeather();
  }
)

Timer.set(20000, false, stopScript)