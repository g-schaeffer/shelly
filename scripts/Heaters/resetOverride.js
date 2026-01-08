Shelly.call("Boolean.Set", {"id":"200", "value": false},
  function (response, error_code, error_message) {
    if(error_code != 0){
      console.log("Error setting new status to " + false);
      return;
    }
  }
)

Shelly.call('Script.Stop', {"id": Shelly.getCurrentScriptId()},
  function (response, error_code, error_message) {
  }
)