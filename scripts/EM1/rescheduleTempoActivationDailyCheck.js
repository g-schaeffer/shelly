Shelly.call('Schedule.Update', {"id": 2, "enable":true},
  function (response, error_code, error_message) {
    if(error_code != 0){
      console.log("Error calling Schedule.Update id=2 " + error_code + " - message: '" + error_message + "'");
      return;
    }
    Shelly.call('Schedule.Update', {"id": 3, "enable":true},
      function (response, error_code, error_message) {
        if(error_code != 0){
          console.log("Error calling Schedule.Update id=3 " + error_code + " - message: '" + error_message + "'");
          return;
        }
        // Stop current Script.id
        Shelly.call('Script.Stop', {"id": Shelly.getCurrentScriptId()},
          function (response, error_code, error_message) {
          }
        )
      }
    )
  }
)