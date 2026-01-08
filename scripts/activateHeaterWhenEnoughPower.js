let RemoteShelly = {
  _cb: function (result, error_code, error_message, callback) {
    let rpcResult = JSON.parse(result.body);
    let rpcCode = result.code;
    let rpcMessage = result.message;
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
  getInstance: function (address) {
    let rs = Object.create(this);
    // remove static method
    rs.getInstance = null;
    rs.address = address;
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



let CONFIG = {
  MARGIN_WATTS: 200,
  WATER_PUMP_WATTS: 1000,
  HEATER_WATTS: 1500,
  LOOP_DELAY_SECONDS: 10,
  POWER_COUNTS_REQUIRED: 10,
};


let heaterOne = RemoteShelly.getInstance("192.168.1.38");
let waterPump = RemoteShelly.getInstance("192.168.1.20");

let my_user_data = {
  isTempoActive: false,
  isHeaterEcoMode : false,
  isWaterPump: false,
  produced : FixedQueue.getInstance(CONFIG.POWER_COUNTS_REQUIRED, "produced"),
  consumed: FixedQueue.getInstance(CONFIG.POWER_COUNTS_REQUIRED, "consumed"),
}

function persistConsumedAndThen(response, error_code, error_message, user_data) {
  user_data.consumed.push(response.act_power)

  // user_data.consumed.printQueue()
  // user_data.produced.printQueue()
  let total_produced_power = user_data.produced.getAverage()
  let available_power = total_produced_power - user_data.consumed.getAverage()
  let trustable_metrics = user_data.consumed.isFull() && user_data.produced.isFull()

  console.log("Available Power = "+ available_power + " - Trustable? " + trustable_metrics )

  if(!trustable_metrics){
    return;
  }

    // Verify hours
  let unixTimestamp = Shelly.getComponentStatus("sys")
  const date = new Date(unixTimestamp.unixtime* 1000);
  const currentHour = date.getHours();
  if (currentHour < 6 || currentHour >= 21){
    console.log("Inside low-cost hours, do not do anything");
    return;
  }

  if (user_data.isTempoActive == false){
    console.log("Tempo not active");
    return;
  }

  let setHeaterEcoMode = null
  let shutdownWaterPump = false;

  // HEater is OFF, can we activate?
  if (user_data.isHeaterEcoMode && available_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS)){
    // 1700W available, let's start heater'
    console.log("Enough power, set to ON")
    setHeaterEcoMode=false
  } else if (user_data.isHeaterEcoMode && user_data.isWaterPump &&
         available_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS - CONFIG.WATER_PUMP_WATTS) &&
         total_produced_power > (CONFIG.MARGIN_WATTS + CONFIG.HEATER_WATTS) ){
      // if 700W available and pump on, might try to shutdown water pump (and if total produced is at least enough)
      console.log("Call to set water pump OFF to free 1kW");
      shutdownWaterPump = true;
  } else if (!user_data.isHeaterEcoMode) {
    // Heater is on, check if we need to stop it (or stop pump)
    if (available_power < 0 && available_power > - CONFIG.WATER_PUMP_WATTS && user_data.isWaterPump){
      console.log("Call to set water pump OFF to free 1kW to avoid shutting down heater")
      shutdownWaterPump = true;
    } else if (available_power  < 0) {
      console.log("Not enough power, shutting donw")
      setHeaterEcoMode=true
    }
  }


  if (shutdownWaterPump == true){
    console.log("Call to shutdown pump")
    waterPump.call("Switch.Set",
      {"id":"0", on: false},
      function (response, error_code, error_message) {
        if(error_code != 200) {
          print(JSON.stringify(response), error_code, error_message);
        }
        user_data.produced.clear();
        user_data.consumed.clear();
      }
    )
  }
  if (setHeaterEcoMode != null){
    console.log("Call to set heaterEcoMode "+setHeaterEcoMode )
    heaterOne.call("Switch.Set",
      {"id":"0", on: setHeaterEcoMode},
      function (response, error_code, error_message) {
        if(error_code != 200) {
          print(JSON.stringify(response), error_code, error_message);
        }
        user_data.produced.clear();
        user_data.consumed.clear();
      }
    )
  }
}


function persistProducedAndThenGetConsumed(response, error_code, error_message, user_data) {
  user_data.produced.push(-response.act_power)
  // Get total consumed power
  Shelly.call("EM1.GetStatus",
    {"id":"0"},
    function (response, error_code, error_message, user_data) {
      persistConsumedAndThen(response, error_code, error_message, my_user_data);
    },
    my_user_data
  )
}

function persistHeaterStateAndThenGetProduced(response, error_code, error_message, user_data) {
  user_data.isHeaterEcoMode = response.output

  // Get total consumed power
  Shelly.call("EM1.GetStatus",
    {"id":"1"},
    function (response, error_code, error_message, user_data) {
      persistProducedAndThenGetConsumed(response, error_code, error_message, my_user_data);
    },
    my_user_data
  )
}

function persistWaterPumpAndThenGetHeaterState(response, error_code, error_message, user_data) {
  user_data.isWaterPump = response.output

  // Get total consumed power
  heaterOne.call("Switch.GetStatus",
        {"id":"0"},
    function (response, error_code, error_message, user_data) {
      persistHeaterStateAndThenGetProduced(response, error_code, error_message, my_user_data);
    },
    my_user_data
  )
}


function CheckAvailablePower() {
  // Get Boolean Status for ProEM TempoActive
  Shelly.call("Boolean.GetStatus", {"id":"200"},
    function (response, error_code, error_message) {
      my_user_data.isTempoActive = response.value;
      // Get HEaterState
      waterPump.call("Switch.GetStatus",
        {"id":"0"},
        function (response, error_code, error_message, user_data) {
          persistWaterPumpAndThenGetHeaterState(response, error_code, error_message, my_user_data);
        },
        my_user_data
      )
    }
  )
}

CheckAvailablePower()
// Verify every 10 secs
Timer.set(CONFIG.LOOP_DELAY_SECONDS*1000, true, CheckAvailablePower)