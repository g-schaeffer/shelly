////////////////////////////////////////////////////////////////////////////////////////////
// CLASSES
////////////////////////////////////////////////////////////////////////////////////////////


let RemoteShelly = {
  _cb: function (result, error_code, error_message, callback) {
    let rpcResult = {}
    if (result && result.body){
      rpcResult = JSON.parse(result.body);
    }
    let rpcCode = 500
    if (result && result.code){
      rpcCode = result.code;
    }
    let rpcMessage = "unknown error";
    if (result && result.code){
      rpcMessage = result.message
    }
    callback(rpcResult, rpcCode, rpcMessage);
  },
  composeEndpoint: function (method) {
    return "http://" + this.address + "/rpc/" + method;
  },
  call: function (rpc, data, callback) {
    let postData = {
      url: this.composeEndpoint(rpc),
      body: data,
    };
    Shelly.call("HTTP.POST", postData, RemoteShelly._cb, callback);
  },
  isScheduleActive : function (date){
    return this.schedule_fun(date);
  },
  getInstance: function (address, name, schedule_fun) {
    let rs = Object.create(this);
    // remove static method
    rs.getInstance = null;
    rs.address = address;
    rs.name = name;
    rs.schedule_fun = schedule_fun;
    rs.overrideAllowed = false;
    return rs;
  },
};



let FixedQueue = {
  push: function (arg) {
      if(this.elements.length >= this.max_size){
          this.elements.splice(0, 1);
      }
      return this.elements.push(arg);
  },
  getAverage: function () {
    let sum = 0;
    for(i=0;i<this.elements.length;i++){
      sum += this.elements[i];
    }
    return sum / this.elements.length;
  },
  isFull : function () {
    return this.elements.length == this.max_size;
  },
  clear : function () {
    return this.elements = [];
  },
  printQueue : function (){
    console.log("Queue "+this.name + ": isFull ? " + this.isFull() + ", average: " + this.getAverage())
  },
  getInstance: function (max_size, name) {
    let fq = Object.create(this);
    // remove static method
    fq.getInstance = null;
    fq.elements = [];
    fq.max_size = max_size;
    fq.name = name;
    return fq;
  },
};


////////////////////////////////////////////////////////////////////////////////////////////
// CONFIGS
////////////////////////////////////////////////////////////////////////////////////////////

let scenes_config = {
  cloud_url: "",
  auth_key: "",
  notif_scene_name: "Autom",
  notif_scene_id: "1768214869764",
}


let CONFIG = {
  MARGIN_WATTS: 50,
  WATER_PUMP_WATTS: 1000,
  HEATER_WATTS: 1500,
  LOOP_DELAY_SECONDS: 10,
  POWER_COUNTS_REQUIRED: 10,
};


////////////////////////////////////////////////////////////////////////////////////////////
// DEVICES DECLARATION
////////////////////////////////////////////////////////////////////////////////////////////

// Radiateur Salon
let heaterOne = RemoteShelly.getInstance("192.168.1.38", "Radiateur Salon", function(date) {
  let current_hour = date.getHours();
  let current_mins = date.getMinutes();
  let current_day = date.getDay(); // 0 Sun to 6 Sat
  if ((current_hour >= 3 && current_hour < 6)
    || (current_hour >= 9 && current_hour < 10)
    || (current_hour >= 16 && current_hour < 22)){
    return true;
  }
  else if ((current_day == 3 || current_day == 6 || current_day ==0)
    && current_hour >= 6 && current_hour < 10) {
    return true;
  }
  return false;
});

// Radiateur Entree
let heaterTwo = RemoteShelly.getInstance("192.168.1.68", "Radiateur Entree", function(date) {
  let current_hour = date.getHours();
  if ((current_hour >= 4 && current_hour < 6)
    || (current_hour >= 12 && current_hour < 16)){
    return true;
  }
  return false;
});

// Filtration piscine
let waterPump = RemoteShelly.getInstance("192.168.1.20", "Pompe filtration", null);


////////////////////////////////////////////////////////////////////////////////////////////
// BUSINESS DATA
////////////////////////////////////////////////////////////////////////////////////////////

let my_user_data = {
  isTempoActive: false,
  isOverallFullyAutomated: true,
  isHeaterOneEcoMode : false,
  isHeaterOneFullyAutomated : false,
  isHeaterTwoEcoMode : false,
  isHeaterTwoFullyAutomated : false,
  isWaterPump: false,
  produced : FixedQueue.getInstance(CONFIG.POWER_COUNTS_REQUIRED, "produced"),
  consumed: FixedQueue.getInstance(CONFIG.POWER_COUNTS_REQUIRED, "consumed"),
  display : function (){
    console.log("user_data: tempoActive="+this.isTempoActive +
      ", heat1Eco=" + this.isHeaterOneEcoMode+ " fullAutomation=" + this.isHeaterOneFullyAutomated  +
      ", heat2Eco=" + this.isHeaterTwoEcoMode+ " fullAutomation=" + this.isHeaterTwoFullyAutomated  +
      ", pump=" + this.isWaterPump)
  }
}



////////////////////////////////////////////////////////////////////////////////////////////
// UTILITIES METHODS
////////////////////////////////////////////////////////////////////////////////////////////

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


function updateDeviceSwitch(user_data, device, switchState, switchName){
  console.log("Call to set " + device.name + " " + switchName + "=" + switchState)
  device.call("Switch.Set",
    {"id":"0", on: switchState},
    function (response, error_code, error_message) {
      if(error_code != 200){
        console.log("Error calling " + device.name + " " + switchName + "=" +
         switchState + " error" + error_code + " - message: '" + error_message + "'");
        return -1;
      }
      user_data.produced.clear();
      user_data.consumed.clear();
    }
  )
}


function findFirstHeater(ecoModeTarget, user_data){
  if (user_data.isHeaterOneEcoMode == ecoModeTarget
      && user_data.isOverallFullyAutomated
      && !heaterOne.overrideAllowed ){
    return heaterOne;
  } else if (user_data.isHeaterTwoEcoMode == ecoModeTarget
      && user_data.isOverallFullyAutomated
      && !heaterTwo.overrideAllowed ){
    return heaterTwo;
  } else {
    return null;
  }
}


function findFirstComfortHeaterWithoutSchedule(user_data, date){
  if (user_data.isHeaterOneEcoMode == false
      && !heaterOne.overrideAllowed
      && user_data.isOverallFullyAutomated
      && !heaterOne.isScheduleActive(date)){
    return heaterOne;
  } else if (user_data.isHeaterTwoEcoMode == false
      && !heaterTwo.overrideAllowed
      && user_data.isOverallFullyAutomated
      && !heaterTwo.isScheduleActive(date)){
    return heaterTwo;
  } else {
    return null;
  }
}



////////////////////////////////////////////////////////////////////////////////////////////
// BUSINESS LOGIC
////////////////////////////////////////////////////////////////////////////////////////////

function performBusinessLogic(response, error_code, error_message, user_data) {
  // user_data.consumed.printQueue()
  // user_data.produced.printQueue()
  let total_produced_power = my_user_data.produced.getAverage()
  let available_power = total_produced_power - my_user_data.consumed.getAverage()
  let trustable_metrics = my_user_data.consumed.isFull() && my_user_data.produced.isFull()

  // console.log("Available Power = "+ available_power + " - Trustable? " + trustable_metrics )
  // my_user_data.display()
  if(!trustable_metrics){
    return;
  }

    // Verify hours
  let unixTimestamp = Shelly.getComponentStatus("sys")
  const date = new Date(unixTimestamp.unixtime* 1000);
  const currentHour = date.getHours();
  if (currentHour < 6 || currentHour >= 22){
    console.log("Inside low-cost hours, do not do anything");
    return;
  }

  let setHeaterEcoMode = null;
  let setWaterPumpMode = null;
  let targetHeater = null;

  // 1. Is there at least one heater OFF
  //   Yes
  //    1.1.1 is there enough power to start
  //     Yes
  //       find first OFF heater and start it
  //     No
  //       1.2 is tempo mode active ?
  //          Yes
  //            1.2.1 is pump ON and and remaining power +1kW enough for a heater?
  //                Yes -> shut pump down
  //                No -> do nothing
  //          No -> do nothing
  //   No -> do nothing

  let heaterMessage = null;

  let firstEcoHeater = findFirstHeater(true, my_user_data);
  if (firstEcoHeater){
    if (available_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS)){
      heaterMessage = "Demarrage " + firstEcoHeater.name + ": production suffisante";
      console.log(heaterMessage);
      targetHeater = firstEcoHeater;
      setHeaterEcoMode = false;
    } else {
      if (my_user_data.isTempoActive &&
           my_user_data.isWaterPump &&
           available_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS - CONFIG.WATER_PUMP_WATTS) &&
           total_produced_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS)) {
        console.log("Enough power should be ok after pump shutdown "+firstEcoHeater.name);
        heaterMessage = "Arret filtration: Tempo Actif, production suffisante pour demarrer "+firstEcoHeater.name;
        setWaterPumpMode = false;
      } else {
        if (!my_user_data.isTempoActive){
          // console.log("Tempo is not active, do not touch water pump")
        }
        else if (my_user_data.isWaterPump){
          // console.log("Not enough power to start heater even if sutting down water pump")
        } else {
          // console.log("Not enough power to start heater")
        }
      }
    }
  } else {
    console.log("No heater to start");
  }

  // 2. Is remaining power < 0
  //   Yes
  //     2.0 if at least one heater ON
  //     Yes
  //        2.1 is tempo mode active?
  //          Yes
  //             2.1.1. is pump ON and and remaining power +1kW enough for a heater
  //                Yes -> shut pump down
  //                No -> find first ON heater and shut it down
  //          No
  //            is there at least one heater with current schedule ECO
  //              Yes -> find first ON heater and shut it down
  //              No -> do nothing
  //   No
  //      If water pump on and tempo mode, shutdonw pump
  let waterPumpMessage = null;
  let firstConfortHeater = findFirstHeater(false, my_user_data);
  if (available_power < 0){
    if (firstConfortHeater){
      if (my_user_data.isTempoActive){
        if (my_user_data.isWaterPump &&
           available_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS - CONFIG.WATER_PUMP_WATTS) &&
           total_produced_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS)) {
          console.log("Enough power should be ok after pump shutdown to keep "+firstConfortHeater.name);
          waterPumpMessage = "Arret filtration: Tempo Actif, production suffisante pour conserver "+firstConfortHeater.name
          setWaterPumpMode = false;
        } else {
          heaterMessage = "Arret "+firstConfortHeater.name+ ": mode confort et Tempo actif, production insuffisante"
          console.log(heaterMessage);
          targetHeater = firstConfortHeater;
          setHeaterEcoMode = true;
        }
      } else {
        let firstConfortHeaterWithoutSchedule = findFirstComfortHeaterWithoutSchedule(my_user_data, date);
        if (firstConfortHeaterWithoutSchedule){
          heaterMessage = "Arret "  + firstConfortHeaterWithoutSchedule.name + ": mode confort hors-programme, production insuffisante"
          console.log(heaterMessage);
          targetHeater = firstConfortHeaterWithoutSchedule;
          setHeaterEcoMode = true;
        }
      }
    } else {
      console.log ("No heater to shutdown")
      if (my_user_data.isTempoActive && my_user_data.isWaterPump) {
        waterPumpMessage = "Tempo actif et production insuffisante, arret de la filtration"
        console.log(waterPumpMessage);
        setWaterPumpMode = false;
      }
    }
  }


  if (setHeaterEcoMode != null && targetHeater != null){
    updateDeviceSwitch(my_user_data, targetHeater, setHeaterEcoMode, "ecoMode");
  }
  if (setWaterPumpMode != null){
    updateDeviceSwitch(my_user_data, waterPump, setWaterPumpMode, "activate");
  }
  if(heaterMessage){
    customNotif(heaterMessage)
  }
  // Timer - wait 5s before sending the water pump message to avoid override with heater message
  Timer.set(5*1000, false, function(){
    if(waterPumpMessage){
      customNotif(waterPumpMessage)
    }
  });
}



////////////////////////////////////////////////////////////////////////////////////////////
// STATE MATCHINE
////////////////////////////////////////////////////////////////////////////////////////////

function StartProcess() {
  // Get Boolean Status for TempoActive
  Shelly.call("Boolean.GetStatus", {"id":"200"},
    function (response, error_code, error_message) {
      if(error_code != 0){
        console.log("Error calling tempo active state " + error_code + " - message: '" + error_message + "'");
        return;
      }
      my_user_data.isTempoActive = response.value;
      // Get Overall Automation sate
      Shelly.call("Boolean.GetStatus", {"id":"201"},
        function (response, error_code, error_message) {
          persistOverallAutomationStateAndThenGetWaterPumpState(response, error_code, error_message, my_user_data);
        },
        my_user_data
      )
    }
  )
}


function persistOverallAutomationStateAndThenGetWaterPumpState(response, error_code, error_message, user_data){
  if(error_code != 0){
    console.log("Error calling overall automation state " + error_code + " - message: '" + error_message + "'");
    return;
  }
  // Boolean values:
  // True = Automated
  // False = Semi-Automated
  my_user_data.isOverallFullyAutomated = response.value

  // Get WaterPump State
  waterPump.call("Switch.GetStatus",
    {"id":"0"},
    function (response, error_code, error_message, user_data) {
      persistWaterPumpAndThenGetHeaterOneState(response, error_code, error_message, user_data);
    },
    my_user_data
  )
}


function persistWaterPumpAndThenGetHeaterOneState(response, error_code, error_message, user_data) {
  if(error_code != 200){
    console.log("Error calling get pump state " + error_code + " - message: '" + error_message + "'");
    return;
  }
  my_user_data.isWaterPump = response.output

  // Get heater one status
  heaterOne.call("Switch.GetStatus",
        {"id":"0"},
    function (response, error_code, error_message, user_data) {
      persistHeaterOneStateAndThenGetHeaterOneOverrideState(response, error_code, error_message, user_data);
    },
    user_data
  )
}


function persistHeaterOneStateAndThenGetHeaterOneOverrideState(response, error_code, error_message, user_data) {
  if(error_code != 200){
    console.log("Error calling get heater One state " + error_code + " - message: '" + error_message + "'");
    return;
  }
  my_user_data.isHeaterOneEcoMode = response.output

  // Get heater one override/automation
  heaterOne.call("Boolean.GetStatus",
        {"id":"200"},
    function (response, error_code, error_message, user_data) {
      persistHeaterOneOverrideStateAndThenGetHeaterTwoState(response, error_code, error_message, user_data);
    },
    user_data
  )
}


function persistHeaterOneOverrideStateAndThenGetHeaterTwoState(response, error_code, error_message, user_data) {
  if(error_code != 200){
    console.log("Error calling get heater One automation state " + error_code + " - message: '" + error_message + "' "+JSON.stringify(response));
    return;
  }
  // Boolean values:
  // True = Automated
  // False = Semi-Automated
  my_user_data.isHeaterOneFullyAutomated = response.value
  heaterOne.overrideAllowed = !response.value

  // Get heater two status
  heaterTwo.call("Switch.GetStatus",
        {"id":"0"},
    function (response, error_code, error_message, user_data) {
      persistHeaterTwoStateAndThenGetHeaterTwoOverrideState(response, error_code, error_message, user_data);
    },
    user_data
  )
}


function persistHeaterTwoStateAndThenGetHeaterTwoOverrideState(response, error_code, error_message, user_data) {
  if(error_code != 200){
    console.log("Error calling get heater Two state " + error_code + " - message: '" + error_message + "' "+JSON.stringify(response));
    return;
  }
  my_user_data.isHeaterTwoEcoMode = response.output

  // Get heater two override status
  heaterTwo.call("Boolean.GetStatus",
        {"id":"200"},
    function (response, error_code, error_message, user_data) {
      persistHeaterTwoOverrideStateAndThenGetProduced(response, error_code, error_message, user_data);
    },
    user_data
  )
}


function persistHeaterTwoOverrideStateAndThenGetProduced(response, error_code, error_message, user_data) {
  if(error_code != 200){
    console.log("Error calling get heater Two Automation state " + error_code + " - message: '" + error_message + "' - " + JSON.stringify(response));
    return;
  }
  // Boolean values:
  // True = Automated
  // False = Semi-Automated
  my_user_data.isHeaterTwoFullyAutomated = response.value
  heaterTwo.overrideAllowed = !response.value

  // Get total produced power
  Shelly.call("EM1.GetStatus",
    {"id":"1"},
    function (response, error_code, error_message, user_data) {
      persistProducedAndThenGetConsumed(response, error_code, error_message, user_data);
    },
    user_data
  )
}


function persistProducedAndThenGetConsumed(response, error_code, error_message, user_data) {
  if(error_code != 0){
    console.log("Error calling get produced " + error_code + " - message: '" + error_message + "'");
    return;
  }
  my_user_data.produced.push(-response.act_power)
  // Get total consumed power
  Shelly.call("EM1.GetStatus",
    {"id":"0"},
    function (response, error_code, error_message, user_data) {
      persistConsumedAndThenPerformBusinessLogic(response, error_code, error_message, user_data);
    },
    user_data
  )
}


function persistConsumedAndThenPerformBusinessLogic(response, error_code, error_message, user_data) {
  if(error_code != 0){
    console.log("Error calling get consumed " + error_code + " - message: '" + error_message + "'");
    return;
  }
  my_user_data.consumed.push(response.act_power)

  performBusinessLogic(response, error_code, error_message, my_user_data)
}


////////////////////////////////////////////////////////////////////////////////////////////
// SCRIPT ENTRY POINT
////////////////////////////////////////////////////////////////////////////////////////////


Shelly.call('KVS.Get',
  {"key": "cloud-config"},
  function (response, error_code, error_message) {
    let parsed = JSON.parse(response.value);
    scenes_config.cloud_url = parsed.cloud_url ;
    scenes_config.auth_key = parsed.auth_key;
    StartProcess();
  }
)
// Verify every 10 secs
Timer.set(CONFIG.LOOP_DELAY_SECONDS*1000, true, StartProcess)